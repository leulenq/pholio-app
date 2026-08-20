# Delisted from the launch dataset — 2026-08-19

Owner directive: the launch registry is the US off-Pholio agency set (plus Fashion Week
Brooklyn, which ships via the event mode, not this dataset). These four routes belong to
non-US organizations or non-US-entity forms and were removed from `v1/manifest.json`
(dataset `2026.08.19.1`):

- `elite-japan-tokyo:online` — Elite Model Japan, Tokyo
- `models1-uk:online` — Models 1, London
- `storm-management-uk:online` — Storm Management, London
- `elite-model-management-global:online` — the Elite global-entity form (the US route,
  `elite-models-na:online-general`, remains; SELECTION.md had already rejected the global
  route as a launch route)

The spec files are preserved here verbatim as prior art. Production delisting of an
already-published series uses `npm run delist:spec-registry`. Re-listing later means
moving a file back into `v1/specs/` and restoring its manifest record after a fresh
re-verification pass — do not restore stale research as current.

Kept in the dataset although outside the launch ten (both US organizations, reference
tier): `img-models-global:online` (IMG is NYC-headquartered; its intake form is global)
and `the-society-management-nyc:online`.
