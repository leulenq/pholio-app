# Talent Dashboard Button Audit

Date: 2026-06-27

## Scope

Audited the routed talent dashboard shell:

- `/dashboard/talent`
- `/dashboard/talent/profile`
- `/dashboard/talent/media`
- `/dashboard/talent/analytics`
- `/dashboard/talent/settings/*`

Explicitly excluded:

- `/dashboard/talent/applications`
- `/dashboard/talent/applications/apply`
- `/apply` and its onboarding workflow

The standalone cinematic reveal/onboarding experience is not rendered inside
the talent dashboard shell and retains its own interaction contract.

## Findings and resolution

| Surface | Inconsistency found | Resolution |
| --- | --- | --- |
| Overview | Existing `PholioButton` used a dark-surface palette with weak light-surface contrast. | Opted all overview commands into the dashboard system. |
| Profile | Save, social actions, credits, and training-writing commands used four unrelated treatments. | Migrated those commands to the dashboard system. Kept booking lanes, measurement units, readiness rows, and icon controls specialized. |
| Media | Digitals, upload, comp-card, review, crop, metadata, confirmation, and editor footer actions each had local button CSS. | Migrated command actions to shared primary, outline, secondary, ghost, inverse, and danger variants. Kept frame overlays, upload tiles, side switches, aspect ratios, visibility, tags, and thumbnail selection specialized. |
| Analytics | Retry was an inline-styled yellow-gold button. | Replaced it with the shared outline command. Kept time ranges as filters. |
| Settings | `ts-btn`, invoice actions, report actions, checkout actions, and destructive actions were separate systems. | Migrated all command actions and dashboard-owned modal actions. Kept section navigation, frequency, billing-plan, and layout selectors specialized. |
| Shared workflow components | Writing, confirmation, reporting, and checkout components are also used by excluded workflows. | Added explicit dashboard opt-ins. Defaults remain legacy, preventing Applications/Apply from inheriting this redesign. |

## Shared command contract

`PholioButton` now exposes the dashboard treatment through
`system="dashboard"`:

- `primary` / `solid`: deep gold fill with white text
- `outline`: restrained gold outline based on Download Digitals
- `secondary`: neutral light-surface action
- `ghost`: low-emphasis action
- `inverse` / `inverse-ghost`: dark editor surfaces
- `danger` / `danger-ghost`: destructive hierarchy
- `sm`, `md`, `lg`, and full-width sizing

The command gold is `#8A6224`, which has approximately 5.14:1 contrast against
the dashboard cream `#FAF8F5` and 5.45:1 against white. It replaces bright
yellow-gold button text without changing non-button brand accents.

There are 62 explicit dashboard-system opt-in call sites across the in-scope
route graph. The excluded Applications and Apply sources contain none.
