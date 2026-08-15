# Pholio Spec Registry v1

The Spec Registry is a source-backed data package describing what a particular agency route
publishes for a particular applicant scope. It is deliberately separate from agency profile
rows, application snapshots, matching code, and UI copy.

The registry answers questions such as:

- Which images does this route ask for?
- Which clothing, grooming, capture, and alteration rules apply?
- What file and eligibility constraints are published?
- Which facts are unknown rather than unrestricted?
- Which official source supports each assertion, and when was it reviewed?

## Package boundary

One spec file is one immutable revision of this identity:

`organization + office/market + submission channel + divisions/tracks`

An agency name is never sufficient identity. Elite Models North America, Elite Model
Management's global form, and Elite Japan are separate series because their published rules
differ materially.

`manifest.json` selects the current revision of each series. A changed fact, source, scope, or
review state creates a new revision file; published revision files are not edited in place.
Historical revisions remain addressable so an application can eventually snapshot the exact
spec it was checked against.

The current package contains ten reviewed route revisions. The files remain the editorial source
of truth; a controlled publisher materializes them into immutable database revisions consumed by
the API, matcher, application snapshots, and talent UI.

## Runtime and publication

Runtime requests never read registry JSON from the application filesystem. Publication is an
explicit release operation. Production mappings use database agency UUIDs only; names, slugs,
and fuzzy matching are never used. Provide an environment-specific mapping document through
`SPEC_REGISTRY_AGENCY_ROUTES_JSON`, `SPEC_REGISTRY_AGENCY_ROUTES_FILE`, or `--mapping-file`:

```json
{
  "schemaVersion": "1.0.0",
  "routes": [
    {
      "agencyId": "00000000-0000-4000-8000-000000000001",
      "seriesId": "models1-uk:online",
      "priority": 10
    }
  ]
}
```

The document is authoritative for every agency UUID it contains: publication removes stale
series links for those agencies, upserts the listed links, and verifies the exact stored result.
It does not alter agencies omitted from the document. Missing agencies, non-current series,
empty configuration, or verification drift fail closed.

Run the complete pre-traffic release gate:

```bash
npm run validate:spec-registry
npm run release:spec-registry
```

`release:spec-registry` applies migrations first, validates and publishes the package, reconciles
the configured agency UUID mappings, and runs a read-only mapping verification gate. Re-running
the same release is idempotent. Reusing a dataset or revision ID for different content fails
closed and records a failed sync run. A historical dataset cannot be reactivated by the normal
publisher; rollback requires a separately designed and audited operational path.

Deploy migrations and complete this release gate **before directing traffic to application code
that reads Spec Registry data or writes delivery metadata**. This ordering closes the rolling
deployment gap for both the registry tables and the nullable delivery/original-delivery columns.
Do not rely on application startup to migrate, publish, or repair mappings. To inspect an already
released environment without writing, run:

```bash
npm run verify:spec-registry-release
```

The materialized model retains:

- immutable datasets, series, revisions, and manifest membership;
- an atomic singleton pointer to the current complete dataset;
- sync audit history and canonical SHA-256 hashes;
- explicit agency-ID-to-series links (never runtime name matching);
- one immutable evaluation snapshot per application submission attempt; and
- MIME type, byte size, and dimensions for the exact processed image Pholio can deliver.

Owner-authenticated talent consumers use:

- `GET /api/talent/spec-registry/routes`
- `GET /api/talent/spec-registry/routes/:seriesId`
- `POST /api/talent/spec-registry/preflight`

Preflight evaluates a talent's explicitly selected, agency-eligible images. It returns
`satisfied`, `missing`, `violates`, `unknown`, and `not_applicable` findings, with source wording,
evidence, freshness, and image assignments. It never returns a score or an allow/deny decision;
`submission.canProceed` remains true for every current public-source revision.

## Current coverage

| Series | Route scope | Review status |
| --- | --- | --- |
| `elite-japan-tokyo:online` | Elite Japan, Tokyo online | verified |
| `elite-model-management-global:online` | Elite Model Management global online | verified |
| `elite-models-na:online-general` | Elite Models North America online | verified |
| `ford-models:selected-city-online` | Ford Models applicant-selected city, agency-branded Snapcast | verified |
| `img-models-global:online` | IMG Models global, adult and guardian-first paths | provisional |
| `models1-uk:online` | Models 1 UK online | verified |
| `muse-model-management-nyc:email` | Muse Model Management New York email | verified |
| `storm-management-uk:online` | Storm Management London online | conflicting |
| `the-society-management-nyc:online` | The Society Management New York online | verified |
| `wilhelmina:selected-market-online` | Wilhelmina applicant-selected market online | provisional |

`selected_market` is used when an applicant chooses among discrete receiving markets and the
route cannot truthfully be reduced to one city, country, or region. `source_access_limited`
means a fact could not be observed because the official route gated the next step; it never
means the fact is optional or unrestricted. Storm remains `conflicting` because its current
first-party pages use different guardian-age boundaries. Wilhelmina and IMG remain
`provisional` because part of their gated flows could not be observed without submitting or
authorizing an application.

## Trust and enforcement

Agency wording and Pholio enforcement are different fields:

- `modality` records what the agency published: required, requested, prohibited, preferred,
  encouraged, allowed, or explicitly not required.
- `evaluationMode` records what Pholio may do with the revision.

Public first-party pages and agency-branded provider forms are evidence of published guidance,
but they do not prove that an agency authorized Pholio to block a submission. Therefore every
current revision is `advisory`. The validator permits `blocking` only for a verified revision
supported by `agency_confirmed` evidence.

Suggested product language for public-source revisions is “Based on requirements published by
the agency, checked on DATE.” Do not label these records “agency approved.”

## Assertions and matching

Every fact that can affect a match is atomic and has:

- a stable assertion ID;
- the source modality and assertion basis;
- a small constraint expression using controlled taxonomy fields and values;
- one or more evidence references;
- a matchability level.

`required` and `prohibited` assertions can produce an advisory failure. `preferred` and
`encouraged` assertions can only produce guidance. `allowed` and `not_required` assertions are
informational. `requested` is used for a named submission target whose presence is clear but
whose hard form-required semantics are not exposed.

Consumers should use five outcomes:

- `satisfied`
- `missing`
- `violates`
- `unknown`
- `not_applicable`

Missing asset metadata must produce `unknown`, never `satisfied`. A personality shot remains
manual confirmation in v1. Hair placement is hybrid because current Pholio image signals do
not establish it reliably.

## Unknown is data

Unpublished facts are recorded in `unknowns` with a controlled taxonomy fact, optional
applicability expression, and reason. Absence from a page never means prohibited, optional,
unrestricted, or unlimited. Controlled fact IDs let consumers ask the same question—for
example, whether MIME types are unknown—across every revision.

Visible application fields also preserve requiredness uncertainty:

- `required`
- `optional` (only when explicitly stated)
- `conditional_required`
- `present_requiredness_unknown`

A visible input without an asterisk, browser `required` semantics, or explicit instruction is
not normalized to optional.

Account-password fields, when a source route exposes them, describe control presence only.
Registry producers and consumers must never capture, copy, or persist applicant credential
values.

## Evidence and normalization

Evidence records point to first-party pages and retain retrieval time, locale, locator, and
short source wording where useful. Assertions reference evidence by ID. Do not invent archive
URLs or content hashes when the underlying response was not captured.

Public client bundles may be used as first-party form evidence when they expose validation
semantics that the rendered page does not. In that case the exact asset URL and a captured
SHA-256 hash belong in evidence. Agency-branded third-party form assertions retain
`agency_branded_provider` authority rather than being promoted to first-party publication.

Normalization rules are intentionally conservative:

- preserve the agency's source label alongside canonical fields;
- keep “portrait length” distinct from “headshot”;
- model profile as a view and personality as a purpose;
- keep an “up to 3” maximum distinct from three named requested views;
- do not infer MIME types from a generic image picker;
- normalize an unspecified web `MB` limit to decimal bytes for conservative preflight, while
  retaining the original value and normalization method;
- keep gender- or track-scoped thresholds scoped exactly as published.

## Layout

```text
v1/
├── README.md
├── manifest.json
├── taxonomy.json
├── schemas/
│   ├── manifest.schema.json
│   ├── spec-revision.schema.json
│   └── taxonomy.schema.json
└── specs/
    └── <series-slug>--r<revision>.json
```

## Authoring a revision

1. Identify the exact organization, route, market/office, and applicant scope.
2. Research first-party sources and record every relevant unknown.
3. Preserve source labels; normalize only claims the source supports.
4. Add atomic evidence references to all match-affecting assertions.
5. Add a new immutable revision and update the manifest's current pointer.
6. Run `npm run validate:spec-registry` and the focused Jest suite.
7. Complete an independent source and normalization review before setting `status` to
   `verified`.
8. Publish the reviewed package with `npm run release:spec-registry`.

`nextReviewOn` is a freshness deadline, not an inferred policy end date. Validation rejects a
still-`verified` revision after that date, so a stale or changed page creates review work; it
never silently rewrites a spec.
