# Roster Intelligence Dashboard — Design Spec

**Date:** 2026-06-08
**Status:** Approved
**Scope:** `/dashboard/agency/roster` frontend redesign — visual hierarchy, AI advisory surface, design token migration
**Related:** `2026-06-08-pholio-casting-intelligence-platform-design.md` (casting intelligence platform context)

---

## 1. Problem

The current RosterPage is an operational table — functional but flat. Agencies can't immediately grasp status distribution, and there are no surfaces that surface insight or opportunity. The visual language predates the `--ag-*` design token system and the OverviewPage/InterviewsPage standard.

## 2. Design Goals

1. **Immediate clarity** — agency opens the page and instantly knows who is available, on booking, on hold, or inactive without scanning rows.
2. **Intelligence at the right hierarchy** — AI advisory moments surface above the list, not buried in rows or hidden behind clicks.
3. **Advisory, not chatbot** — insights feel like a senior colleague's observation, not a tech overlay or generic AI label.
4. **Hierarchy over density** — three-layer structure (metrics → intelligence → list) reduces visual competition between sections.
5. **Token alignment** — all styles migrate to `--ag-*` system tokens.

## 3. Three-Layer Hierarchy

```
┌─────────────────────────────────────────────┐
│  HEADER: Eyebrow / Serif Title / Subline     │  [Add Talent CTA]
├─────────────────────────────────────────────┤
│  STAT LEDGER: Available · Booking · Hold · Inactive (Playfair numerals)
├─────────────────────────────────────────────┤
│  INTELLIGENCE STRIP (collapsible)            │
│  ┌──────────────┬──────────────┬────────────┐│
│  │ Attention    │ Opportunity  │ Growth     ││
│  │ 3 idle 90d   │ Runway gap   │ Profile gap││
│  └──────────────┴──────────────┴────────────┘│
├─────────────────────────────────────────────┤
│  COMMAND BAR: Search · Gender · Type · Count · View toggle
├─────────────────────────────────────────────┤
│  ROSTER LIST (rows or grid)                  │
│  Each talent may carry a signal dot (6px)    │
│  signaling an insight type (red/gold/green)  │
└─────────────────────────────────────────────┘
```

## 4. Page Header

Pattern matches InterviewsPage exactly:
- Gold uppercase eyebrow: "SIGNED TALENT"
- Playfair Display h1: "Roster"
- Muted uppercase subline built from live counts: "12 available · 3 on booking · 2 on hold · 5 inactive"
- "Add Talent" CTA button (dark pill, hover → gold) floated right

## 5. Stat Ledger

Horizontal strip with Playfair Display numerals. Four stats:

| Stat | Color |
|------|-------|
| Available | `--ag-success` green |
| On Booking | `--ag-gold` |
| On Hold | dark (#16130D) |
| Inactive | muted (#b3a89a) |

Dividers between stats. Matches the `iv-ledger` pattern from InterviewsPage.

## 6. Intelligence Strip (`RosterIntelligenceStrip`)

New component. Three advisory cards in a horizontal grid. Collapsible via chevron toggle (default: open). Cards animate in with stagger on first mount.

Each card:
- 3px left accent bar (red / gold / green by type)
- Type label (9px uppercase: ATTENTION / OPPORTUNITY / GROWTH)
- Title (13px semibold)
- Body copy (11.5px, 1.58 line height) — specific and named, not generic
- Uppercase CTA link ("Review bench →")

Three mock cards:
1. **Attention** (red) — idle bench: 3 talents 90+ days without board submissions
2. **Opportunity** (gold) — runway gap: 2 talents matching open runway briefs, unsubmitted
3. **Growth** (green) — profile completeness: 2 talents missing measurements

## 7. Per-Talent Insight Signals

Seven talents carry mock insight data keyed by `id`. In rows: a 6px colored dot next to the name with a `title` tooltip showing the full insight text. In grid cards: a small uppercase chip below the name.

Signal types mirror intelligence strip colors (attention=red, opportunity=gold, growth=green).

## 8. Advisory Block in Detail Panel

When a talent with insight data opens in TalentPanel (`context="roster"`), `RosterZone` receives an optional `insight` prop and renders an editorial advisory card at the top of the panel body — before the portfolio grid.

Card anatomy:
- 3px left accent (color by type)
- Type label (9px uppercase, color matches accent)
- Body text (12px, 1.6 line height, warm dark)
- Background tinted by type (very subtle)

## 9. AI Content Philosophy

- Copy is **specific and named** ("Marcus Webb, Kofi Mensah, and Tom Bradley") — not "some talents"
- Observations reference **time** ("4 months", "90+ days") — not vague
- Growth suggestions frame as **opportunity** ("could improve placement") — not criticism
- No "AI suggests…" labels — insights are presented as the system's perspective, not flagged as artificial

## 10. All-Static Implementation

All AI content is static mock data. The shape is designed to accept real API data later:
- `TALENT_INSIGHTS: Record<id, { type, text }>` → future: fetched from `/api/agency/roster/insights`
- `INTELLIGENCE: Array<{ type, title, body, cta }>` → future: fetched from `/api/agency/overview/intelligence`
- `RosterZone` `insight` prop → future: populated from server on `fetchRosterProfile` response

## 11. Files Changed

| File | Change |
|------|--------|
| `client/src/domains/agency/pages/RosterPage.jsx` | Header, ledger, intelligence strip import, insight data, signal dots |
| `client/src/domains/agency/pages/RosterPage.css` | Full style update with `--ag-*` tokens, new header/ledger/signal classes |
| `client/src/domains/agency/components/roster/RosterIntelligenceStrip.jsx` | New component |
| `client/src/domains/agency/components/roster/RosterIntelligenceStrip.css` | New styles |
| `client/src/domains/agency/components/TalentPanel.jsx` | Thread `talent.insight` to `RosterZone` |
| `client/src/domains/agency/components/zones/RosterZone.jsx` | Accept `insight` prop, render advisory block |
| `client/src/domains/agency/components/zones/zones.css` | Add `.zone-advisory` styles |
