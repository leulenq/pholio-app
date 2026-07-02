# Onboarding Redesign — "The Screen Test" · Implementation Handoff

**For:** the developer building this into the React SPA.
**Status:** Visual direction fully approved via interactive HTML prototype. Ready to build.
**Design system spec:** `client/src/domains/onboarding/DESIGN.md`
**Approved plan:** `~/.claude/plans/giggly-moseying-goose.md` (audit + rationale)

## Prototypes (open in a browser — they are the source of truth for look & behavior)

- `tasks/onboarding-redesign/prototype-screen-test.html` — the full flow. Bottom pill-bar jumps between all screens. Everything is live: type in a field, pick an identity/lane, drag the measurement tape.
- `tasks/onboarding-redesign/prototype-gender-variants.html` — the 5 gender options that were explored. **Chosen: C (portrait tiles).**
- `tasks/onboarding-redesign/prototype-lanes-variants.html` — the 4 lanes options that were explored. **Chosen: A (editorial image plates).**

> Match the prototype's CSS values (sizes, colors, easings, transitions) rather than re-deriving them. Copy them across; they are already tuned.

---

## Locked decisions (do not re-litigate)

| Area | Decision |
|---|---|
| Concept | "The Screen Test" — one question at a time on a dark stage; personalized. |
| Background | **Keep the original** dark stage. **No grain**, no warm spotlight pool. Two ambient orbs only. |
| Entry screen | **Keep exactly as production** (Google white / Instagram gradient / Email ghost inside the frosted card). |
| Opening intro | **Removed** — open straight on "Let's get you *seen*". Retire `AddressIntro`. |
| Inputs | **Typed directly onto the screen** — no box, no underline. One field system for name/birthdate/market. |
| Birthdate | Native picker, **MM / DD / YYYY** segments + **gold calendar button**, no box. |
| Gender | **Portrait tiles** (direction C); each icon **reflects the identity**. |
| Lanes | **Editorial image plates** (direction A); multi-select, "Not sure yet" exclusive. |
| Digitals | Momentous — **soft breathing gold pool** background; PITS reads on one line; subtle guidance. |
| Measurements | **Preserve `PrecisionDeck`.** Add gold divider, keep tape draggable, re-skin arrows to thin gold chevrons. |
| Headlines | **Always one line**; personalized with the first name after it's collected. |

---

## Step 0 — Tokens (rewrite `:root` in `styles/CastingCinematic.css`)

Adopt the prototype token block. **Delete** the slate leak: `--cinematic-text-muted:#94a3b8`,
the slate `.highlight-blue` gradient-clip rule, and recolor the slate orb-2. Values:

```
--gold:#C9A55A; --gold-deep:#B8956A; --gold-ink:#0A0806;
--text:#F5F1EA; --text-2:rgba(245,241,234,.55); --text-3:rgba(245,241,234,.30);
--ghost:rgba(245,241,234,.15); --hair:rgba(245,241,234,.14);
--ease:cubic-bezier(0.16,1,0.3,1);
```
Remove the `.cinematic-container::before` grain layer. Keep orb-1 gold; make orb-2 a neutral warm-grey (`rgba(120,120,128,.18)`).

## Shared components to build (put in `domains/onboarding/components/`)

1. **`SpotlightField`** — the typed-onto-screen input (name / market; birthdate is a variant).
   Transparent, centered Playfair, gold caret, ghost italic placeholder, soft radial gold pool
   on focus. **No border, no baseline.** Reuse `useTypeToFocus` and `InlineErrorText`.
   Prototype CSS: `.type`, `.type input`, `.type-glow`.
2. **Date skin** — a native `<input type="date" class="date-native">` styled to the field:
   `width:auto` (so the calendar icon hugs the segments), `::-webkit-datetime-edit-text`
   gold-grey separators, `:required:invalid::-webkit-datetime-edit` ghosted, and
   `::-webkit-calendar-picker-indicator` tinted gold. Prototype CSS: `.type input.date-native`.
   Keep the existing COPPA/minor logic in `CastingBirthdate.jsx` (age ≥ 13 gate, minor notice).
3. **`ActionDock`** — fixed bottom-center, reserved height, always mounted. Renders the primary
   action (label per step) + optional "Skip for now" link. State = `disabled|enabled` (color/opacity
   change), **never remounted or repositioned.** This replaces the per-step `fixed bottom-12`
   wrappers and Scout's inline `mt-8`. `CinematicNextButton` becomes its inner button.
   Prototype: `.dock`, `.dock-inner`, `.cta`.
4. **`GenderTiles`** — 4 portrait tiles; icons: Venus (Female), Mars (Male), circle+up-stroke
   (Non-Binary), portrait silhouette (Undisclosed). Selected = gold frame + gold icon + gold label.
   Prototype: `.tiles`, `.tile`, the four inline SVGs.
5. **`LanePlates`** — 3 image plates + 1 exclusive dashed "Not sure yet" text plate. Selected =
   saturate + gold frame + corner check. Prototype: `.plates`, `.plate`, `.plate-text`.

## Per-file changes

- **`pages/CastingCallPage.jsx`** — remove the `AddressIntro`/greet special-casing is unaffected;
  keep the `greet` name beat (it drives personalization). Mount `ActionDock` once at the shell
  level and pass each step a `{label, enabled, onAdvance}` config instead of each step rendering
  its own button. Keep the rail, progress hairline, room-tint, and finishing preloader as-is.
- **`pages/CastingEntry.jsx`** — remove `AddressIntro` (open on the choice card). Leave the three
  auth doors exactly as production. The manual **name/email/password** sub-steps switch from
  `.cinematic-input` boxes to `SpotlightField`; drive them from the `ActionDock`.
- **`pages/CastingBirthdate.jsx`** — swap the boxed input for the date skin. Payload unchanged
  (`{date_of_birth}`).
- **`pages/CastingGender.jsx`** — replace the stage/track with `GenderTiles`. Payload unchanged
  (`{gender}`), values still `Female|Male|Non-Binary|Prefer not to say`.
- **`pages/CastingScout.jsx`** — digitals gold-pool background; **remove the `01`/`02` placard
  indices**; render the PITS read as **one line** of gold chips under the headshot via
  `pitsSignalParts()` (`shared/constants/frameTaxonomy.js`) / `FrameReadCaption`
  (`shared/components/frame/`); make the "Plain background · …" helper **subtle**. Keep the two
  frames, the scan choreography, the "That's the one." beat, and the room-tint handoff.
- **`pages/CastingMeasurements.jsx`** — **preserve `PrecisionDeck`** (drag already implemented via
  pointer capture — keep it). Add a `CinematicDivider` under the height headline; re-skin the
  `ChevronLeft/Right` arrow buttons to thin gold chevrons (borderless, faint→gold, slide on hover
  — prototype `.dial-arrow`). Route CONFIRM/NEXT through the `ActionDock`. Keep the age-gate
  `heightOnly` branch and gender-aware stat fields. Payload unchanged.
- **`pages/CastingProfile.jsx`** — lanes → `LanePlates` (order still `Editorial, Commercial,
  Runway` + "Not sure yet"); market → `SpotlightField` with the suggestion rows restyled to
  **city-left / country-right** (`CITIES` from `data/cities`). Payload unchanged
  (`{city, modeling_categories}`).
- **Headlines everywhere** — `ThinkingText` questions become one-line (nowrap + `clamp/vw`, no
  descender clip) and personalize with the first name once known (`"{Name}, …"`). Thread the same
  first name already captured for the greet beat.
- **Retire `pages/AddressIntro.jsx`** (delete import + file).

## Data contracts — DO NOT CHANGE

This is a **visual** redesign. Every step must send the exact same payloads it does today
(`useCasting*` hooks): entry `{firebase_token, name?, terms_accepted, privacy_accepted}`,
birthdate `{date_of_birth}`, gender `{gender}`, scout `FormData{digi, shot_type}` + confirm,
measurements `{height_cm, …stats}`, profile `{city, modeling_categories}`, complete `{}`.
Preserve resume/rehydration, the minor age-gate (`canCollectSensitiveProfileFields`), and the
dev preview harness (`dev/onboardingPreview.js`, `dev/OnboardingDevPanel.jsx`).

## Motion & a11y (required)

- Ease-out `cubic-bezier(0.16,1,0.3,1)`, no bounce. Step transitions: crossfade + 10px rise.
- **`prefers-reduced-motion`**: crossfades only, no infinite orb/gold-pool loops, instant field
  ignite. (The current flow has no reduced-motion path — add one.)
- Keep `:focus-visible` gold rings; every field/tile/plate is keyboard-operable; date input stays
  a real native control.

## Assets

Lane plates use Unsplash placeholders in the prototype (Editorial `1469334031218-e382a71b716b`,
Commercial `1483985988355-763728e1935b`, Runway `1441984904996-e0b6ba687e04`). **Replace with
owned/licensed lane imagery** before ship.

## Open items to confirm with backend

- **PITS on digitals:** confirm the scout analysis response exposes the signal fields
  (`PITS_SIGNAL_KEYS`) so `pitsSignalParts()` can render real reads; if not, wire it or ship the
  guidance line only until it's available.

## Verification

1. `npm run dev:all`; open `/onboarding`. Use `?preview=<step>` (dev harness) to reach each step
   without auth.
2. Screenshot **entry, name, birthdate, gender, digitals, height, stat, review, lanes, market,
   finishing** and confirm each locked decision above — especially: the action never shifts
   position between steps; no input boxes/underlines; birthdate shows MM/DD/YYYY + gold calendar;
   headlines are one line and personalized; digitals has the gold pool (no dots); lanes plates
   saturate + gold-frame on select; measurements tape drags and arrows are thin gold chevrons.
3. Test `prefers-reduced-motion` and mobile (≤640px). Run `cd client && npm run lint`.
4. Regression: complete a full run end-to-end and verify every payload is unchanged (network tab)
   and a mid-flow reload still resumes.
