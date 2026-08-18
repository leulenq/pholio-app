---
name: Pholio Talent Studio
description: A cinematic stage for a creative's portfolio — warm paper, gold leaf, motion-forward editorial.
colors:
  ink: "#0F172A"
  ink-warm: "#1A1815"
  canvas: "#FAF9F7"
  canvas-alt: "#F5F4F2"
  surface: "#FFFFFF"
  well: "#F8F8F7"
  gold: "#C9A55A"
  gold-bright: "#D4AF37"
  gold-hover: "#B08D45"
  text-dark: "#0F172A"
  text-slate: "#64748B"
  text-light: "#94A3B8"
  border-light: "#E2E8F0"
  border-hover: "#CBD5E1"
  success: "#22C55E"
  error: "#EF4444"
  warning: "#F59E0B"
  info: "#3B82F6"
typography:
  display:
    fontFamily: "Noto Serif Display, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink-warm}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.sm}"
    padding: "10px 22px"
    typography: "{typography.title}"
  button-primary-hover:
    # Ink fill holds; a gold underline sweeps in beneath the label.
    underlineColor: "{colors.gold}"
  input:
    backgroundColor: "{colors.well}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.md}"
    padding: "14px 18px"
    height: "50px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
---

# Design System: Pholio Talent Studio

## 1. Overview

**Creative North Star: "The Portfolio Stage"**

The talent dashboard is a stage on which a creative's work performs. Where the agency system is a calm ledger, this one is cinematic: surfaces reveal, images take the lead, and real milestone moments (unlocking a portfolio or generating a comp card) are celebrated with spring-physics motion rather than a static toast. A model or actor should open this surface and feel their presence is being *staged for an audience* — the software disappears behind the work.

This system is **warm, tactile, and motion-forward**. It shares Pholio's material — cream paper, a single gold accent, Inter body — but speaks in its own voice: Noto Serif Display for editorial headlines, the ink-fill "Editorial Ledger" button system (see `PholioButton`), deeper "pressed paper" form wells, and Framer Motion entrances tuned to feel alive (`stiffness ~55, damping ~16`). It is intentionally a *separate design system* from the agency command center; it trades operational density for breathing room and choreography.

What it explicitly rejects: static, lifeless pages; gamified badge soup; corner metadata chips on portfolio thumbnails; glassmorphism; and any small uppercase eyebrow above a heading. The talent studio should feel like a couture house's private app, not a generic profile editor.

**Key Characteristics:**
- Warm paper canvas (`#FAF9F7`) with white surfaces and soft "well" insets (`#F8F8F7`).
- Noto Serif Display editorial headlines; Inter for the working interface.
- Spring-based Framer Motion entrances, reveals, and celebration moments.
- Ink-fill primary buttons with a gold underline sweep on hover; deep inset gold-halo focus on fields.
- Imagery-led — the portfolio is the hero, chrome stays quiet.

## 2. Colors

A warm paper foundation carrying a single gold accent, with a brighter gold reserved for celebratory highlights and a clean, slightly cooler semantic set inherited from the talent token base.

### Primary
- **Pholio Gold** (`#C9A55A`): Primary actions, progress, focus halos, and accent strokes. Hover deepens to **Antique Gold** (`#B08D45`).
- **Bright Gold** (`#D4AF37`): Reserved for celebratory and gilded moments (unlock reveals, full-strength states) — a higher-key gold than the working accent.

### Neutral
- **Ink** (`#0F172A`): Headlines and primary text (a cool-leaning near-black on this surface).
- **Warm Ink** (`#1A1815`): Used where copy sits on warm panels shared with the agency token base.
- **Canvas** (`#FAF9F7`) / **Canvas Alt** (`#F5F4F2`): Warm paper page and secondary backgrounds.
- **Surface** (`#FFFFFF`): Cards and panels.
- **Well** (`#F8F8F7`): The inset "paper well" background for form fields — the signature pressed-paper field treatment.
- **Slate** (`#64748B`) / **Light** (`#94A3B8`): Secondary and tertiary text.
- **Border Light** (`#E2E8F0`) / **Border Hover** (`#CBD5E1`): Hairline strokes; full borders only.

### Tertiary (Semantic)
- **Success** (`#22C55E`), **Error** (`#EF4444`), **Warning** (`#F59E0B`), **Info** (`#3B82F6`): Genuine state only, never decoration.

### Named Rules
**The Image-First Rule.** On portfolio surfaces, photography is the brightest, most saturated thing on screen. Chrome, accents, and even gold stay quieter than the work so nothing competes with the talent's images.

## 3. Typography

**Display Font:** Noto Serif Display (with Georgia fallback) — the editorial masthead voice.
**Secondary Serif:** Playfair Display — used for select headings.
**Body Font:** Inter (with system fallback).

**Character:** A high-contrast editorial serif over a neutral sans. Noto Serif Display gives talent surfaces a magazine-cover feel — elegant, a touch dramatic — while Inter handles every label and control. The serif sets the emotional register; the sans does the work.

### Hierarchy
- **Display** (Noto Serif Display 400, ~2.25rem, line-height 1.15): Page mastheads, hero names, reveal moments.
- **Headline** (Playfair Display 600, ~1.875rem): Section headings.
- **Title** (Inter 600, 1.25rem): Card and module titles, primary-button text.
- **Body** (Inter 400, 1rem, line-height 1.6): Default reading size; prose caps at 65–75ch.
- **Label** (Inter 500, 0.85rem, letter-spacing 0.08em, uppercase): Form labels and metadata keys — never floated above a heading as an eyebrow.

### Named Rules
**The Editorial Serif Rule.** Serif is for names, titles, and emotional moments — never for buttons, inputs, or dense data. Display type in a control reads as costume.

## 4. Elevation

Layered and lifted. Unlike the flatter agency system, talent surfaces use a real elevation ladder to make cards float and to support hover/active motion. Depth is shadow-driven here, paired with spring transforms (cards lift and translate on hover). Frosted glass remains forbidden on content surfaces.

### Shadow Vocabulary
- **Elevation 1** (`box-shadow: 0 2px 8px rgba(0,0,0,0.06)`): Default resting cards.
- **Elevation 2** (`box-shadow: 0 8px 24px rgba(0,0,0,0.1)`): Hover / focus / important.
- **Elevation 3** (`box-shadow: 0 12px 36px rgba(0,0,0,0.12)`): Active / primary surfaces.
- **Card** (`box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08)`): The signature soft, far-cast portfolio-card shadow.
- **Gold Focus** (`box-shadow: 0 0 0 4px rgba(201,165,90,0.1)`): Field and control focus halo.

### Named Rules
**The Lift-On-Touch Rule.** Interactive cards rise (`translateY` + a step up the shadow ladder) on hover, eased with spring physics. Stillness is for resting state; touch produces motion.

## 5. Components

### Buttons
**Always use the shared `PholioButton` component** (`client/src/shared/components/ui/PholioButton.jsx`) — it is the single canonical implementation for talent controls. Never hand-roll a `<button>` with inline/custom CSS on a talent surface; if a needed variant doesn't exist, extend `PholioButton`/`PholioButton.css`, don't fork it.
- **Shape:** Tight rounded rectangle (`border-radius: 3px`, "Editorial Ledger" direction) — not a pill. No talent variant should reintroduce `border-radius: 9999px` on a button.
- **Primary:** Ink fill (`--ph-btn-ink #1a1815`) with canvas text, 1px ink border, `padding: 10px 22px`, letter-spacing 0.02em. A thin gold underline sweeps in from center on hover/focus — the fill itself never lifts or changes color.
- **Hover / Focus:** No transform, no shadow (`transform`/`box-shadow` are explicitly suppressed by the component) — the gold underline sweep is the entire hover language. Keyboard focus shows a gold outline ring (`outline: 2px solid rgba(201,165,90,0.72)`).
- **Secondary:** Transparent fill, hairline border, ink text; border and text tint gold on hover.
- **Other roles** (`tertiary`, `meta`, `icon`, `destructive`, `toggle`) exist for quieter/inline actions — see the component for the full taxonomy before inventing a new button style.

### Cards / Containers
- **Corner Style:** Extra-large radius (16px).
- **Background:** White (`#FFFFFF`) on warm paper canvas.
- **Shadow Strategy:** Elevation 1 at rest, lifting to Elevation 2 on hover with a spring translate. Portfolio cards use the soft far-cast Card shadow.
- **Border:** Optional hairline (`#E2E8F0`) — full borders only, no colored side-stripes.
- **Internal Padding:** 24px standard.
- **Forbidden:** corner metadata chips on thumbnails, nested cards, glass backgrounds.

### Inputs / Fields
- **Style:** The signature "pressed paper well" — `#F8F8F7` background, transparent-to-gold border, 8px radius, 50px min-height, inner shadow (`inset 0 2px 4px rgba(0,0,0,0.03)`) for depth.
- **Focus:** Border shifts to gold (`rgba(201,165,90,0.3)`), background lifts to white, a wide gold halo appears (`0 0 0 5px rgba(201,165,90,0.12)`), and the field rises `translateY(-1.5px)` — a premium tactile focus.
- **Labels:** Inter 500, dark; sit above the field, never as a section eyebrow.
- **Placeholder:** Light slate, italic.

### Navigation
- **Style:** A slim talent sidebar (≈185px) with a quiet top bar. Inter type, gold marking the active item — no count bubbles, no badges.
- **States:** Hover tints; active carries gold; focus shows the gold ring.
- **Mobile:** Collapses structurally to a drawer / icon rail.

### Signature Component — The Unlock Cinematic
Real milestone moments (profile unlock and comp-card generation) are staged as motion-first cinematic experiences — surfaces reveal, content auto-plays, spring physics carry the entrance — not static poster screens or a single toast. One celebration moment at a time, integrated into the surface, with a `prefers-reduced-motion` crossfade fallback.

## 6. Do's and Don'ts

### Do:
- **Do** keep photography the brightest, most saturated element — chrome and gold stay quieter than the work.
- **Do** use the shared `PholioButton` component (ink-fill primary, gold underline sweep) and the pressed-paper gold-halo field focus — never a custom pill button.
- **Do** animate with spring physics (Framer Motion ~stiffness 55 / damping 16); motion is part of the build.
- **Do** stage milestone moments as cinematic reveals, not static posters or a lone toast.
- **Do** use Noto Serif Display / Playfair for names and headings; Inter for controls and data.
- **Do** ship a `prefers-reduced-motion` alternative for every entrance, reveal, and celebration.

### Don't:
- **Don't** build a custom/pill-shaped button on a talent surface — use `PholioButton`; the shipped primitive is an ink-fill rectangle with a gold underline sweep, not a pill.
- **Don't** build static, lifeless pages — stillness is the resting state, not the whole experience.
- **Don't** place a small uppercase / letter-spaced eyebrow or kicker above any heading.
- **Don't** use status badges or New / Beta / Live / AI-powered feature chips.
- **Don't** overlay tiny metadata chips in the corners of portfolio thumbnails or cards.
- **Don't** use `backdrop-filter: blur()` on cards, panels, or buttons — glass is only for full-screen scrims.
- **Don't** attach count-bubble badges to nav items or cards.
- **Don't** use `border-left`/`border-right` over 1px as a colored accent stripe, or gradient text (`background-clip: text`).
- **Don't** let the talent studio read as a generic profile editor; it is a staged, motion-forward portfolio.
