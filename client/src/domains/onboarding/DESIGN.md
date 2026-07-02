---
name: Pholio Onboarding — The Screen Test
description: A dark, gold, cinematic talent-onboarding system. One-question-at-a-time on a black stage; the talent is *seen* one beat at a time.
register: brand-in-product
colors:
  ink: "#000000"            # the dark stage — kept from the original onboarding
  ink-raise: "#0B0A08"      # menus / floating surfaces on the stage
  gold: "#C9A55A"           # the single accent — platform gold
  gold-deep: "#B8956A"      # gold hover / pressed
  gold-ink: "#0A0806"       # text/checks sitting ON gold fills
  text: "#F5F1EA"           # warm white — primary
  text-2: "rgba(245,241,234,0.55)"   # secondary
  text-3: "rgba(245,241,234,0.30)"   # tertiary / disabled
  ghost:  "rgba(245,241,234,0.15)"   # placeholders, faint marks
  hair:   "rgba(245,241,234,0.14)"   # hairline borders/frames
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    usage: "Every question, every typed answer, every option label. The talent writes in the same face the House asks in."
    letterSpacing: "-0.02em"
  ui:
    fontFamily: "Inter, -apple-system, sans-serif"
    usage: "Rail, dock actions, hints, PITS chips, legal — small uppercase letter-spaced UI only."
motion:
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"   # ease-out, no bounce
  step-transition: "crossfade + 10px rise, ~0.55s"
  field-ignite: "gold caret + soft pool, instant on focus"
  reduced-motion: "required — crossfades only, no infinite orb/pool loops"
rounded:
  field: "0"        # fields have no box
  frame: "3–4px"    # digitals / lane plates
  door: "8px"       # auth buttons (kept from production)
bans:
  - "No input boxes or underlines — answers are typed directly onto the stage."
  - "No grain/noise texture on the stage."
  - "No slate-blue anywhere (the old #94a3b8 ramp and slate orb are gone)."
  - "No badges/chips/glass — per the app-wide banned-pattern list."
---

# Design System: Pholio Onboarding — "The Screen Test"

## 1. North Star

A talent's first contact with Pholio is a **private screen test on a dark stage**.
One question at a time, in gold-lit serif, the House speaking directly to them.
The flow is deliberately a **separate design system** from the cream/editorial
talent and agency dashboards — it shares only the platform gold (`#C9A55A`) and
Inter. Its own material is: a black stage, warm-white type, a single serif
(Playfair Display) carrying both the questions *and* the answers, and gold used
as light rather than decoration.

Escalating personalization is the spine: greet by name → address the talent by
name in every subsequent question → their own photo lights the room → the scan
and the "beats" speak back to them.

## 2. Preserved from the original onboarding (do not rebuild)

- **The dark stage** — black background with two soft ambient orbs (orb-1 gold,
  orb-2 a neutral warm-grey). No grain.
- **The entry screen** — "Let's get you *seen*" + the gold divider + the three
  auth doors (Google white / Instagram gradient / Email ghost) inside the frosted
  card, exactly as production.
- **The measurement deck** (`PrecisionDeck`) — the draggable tape, arrows, unit
  toggle, tap-to-type. The crown jewel; only re-skinned, never restructured.
- **The house voice** — the `AcknowledgmentBeat` gives ("That's the one." /
  "Noted.") and the finishing concentric-ring preloader.

## 3. The two systems that carry the flow

### The Spotlight Field  (name · birthdate · market)
There is **no box and no underline**. The answer is typed directly onto the
stage in the same display serif as the question, lit by a soft radial gold pool,
with a gold caret and a ghosted italic prompt. One instrument, reused everywhere,
so the flow reads as one authored surface.
- **Birthdate** is a native date input wearing this skin: transparent, big serif,
  showing **MM / DD / YYYY** segments (ghosted until filled) with a **gold
  calendar button** (the `::-webkit-calendar-picker-indicator`, tinted gold) that
  sits right beside the segments — the field is content-width and centered, not
  full-bleed, so the icon hugs the date.
- **Market** is the same field; suggestions render as **ruled rows on the stage —
  city name far left (serif), country far right (muted italic)** — no dropdown chrome.

### The Action Dock  (Continue / Next / Confirm / Finish)
One fixed home for the primary action: bottom-center, **reserved height, always
rendered**. It never mounts/unmounts or moves between steps — it only changes
state (dimmed → gold when the step is satisfiable). This is what removes the
"button jumps up and down" problem. A quiet "Skip for now" text-link may sit
under it (market).

## 4. Selection surfaces

- **Identity (gender) — portrait tiles.** Four hairline-framed tiles, each with a
  mark that **reflects the identity** (Venus / Mars / the non-binary symbol / a
  neutral portrait for Undisclosed) + an uppercase label. The chosen tile's frame,
  icon, and label light gold. Single-select.
- **Lanes (work type) — editorial image plates.** Choose your lane by its visual
  world: three cinematic photo plates (Editorial / Commercial / Runway) that
  desaturate→saturate and **frame in gold with a corner check** when selected,
  plus an exclusive dashed **"Not sure yet"** text plate. Multi-select; picking
  "Not sure yet" clears the others and vice-versa.

## 5. Digitals — the momentous stage

The critical give. Its background is a **soft, breathing warm-gold pool**
(radial, gently pulsing — no dot texture), lifting this screen above the others.
Two labeled frames — **Headshot** (required, becomes the casting photo) and
**Full length** (optional) — aligned to the `/media` frame vocabulary. Under the
headshot, **PITS reads render as one quiet gold line** of signal chips
(e.g. *Natural light · Editorial · Eye-level*). The intake guidance
("Plain background · Natural light · Minimal makeup · No filters") sits well below
as a **very subtle** uppercase line. After a photo exists, the **room-tint** turns
on — a heavily blurred, desaturated echo of the talent's own image lighting the
rest of the flow.

## 6. Type & headlines

- **Headlines are always one line.** They scale with the viewport (`clamp` + `vw`,
  `white-space: nowrap`) and never wrap or clip descenders (line-height ≈ 1.18,
  small bottom padding). Once the name is known they personalize:
  *"Ava, when were you born?" · "Ava, how do you identify?" · "Ava, let's see you."*
- **Playfair Display** carries questions, typed answers, and option labels; the
  italicized keyword in each question is gold. **Inter** is only for the rail,
  dock, hints, PITS chips, and legal.

## 7. Motion

Ease-out (`cubic-bezier(0.16,1,0.3,1)`), no bounce. Step transitions are a
crossfade + 10px rise (~0.55s). The gold field ignite and dock state changes are
quick. Reduced-motion is **required**: crossfades only, no infinite orb/pool
loops, instant ignite.
