# Design: Functional Audit Section on Overview Tab

**Date:** 2026-06-01  
**Status:** Approved

---

## Problem

The Audit card on the Overview tab uses a hardcoded `buildChecklist()` with 4 static items (Casting Polaroids, Digital Resume, Measurements & Specs, Intro Reel). It evaluates completion with coarse checks (e.g. `profilePct >= 40`) rather than the real per-field completion system. The "Continue Audit" CTA is already a link to `/dashboard/talent/profile` but items don't navigate to the right section. The entire card is disconnected from the `fieldCompletion` system that correctly powers the Profile page sidebar.

---

## Goal

Make the Audit card show real per-field completion status, navigate each item directly to the relevant Profile section, and surface the top 3 gaps so users know exactly what to fix first.

---

## Architecture

### 1. Extend `useProfileStrength` hook

**File:** `client/src/domains/talent/hooks/useProfileStrength.js`

- Import `calculateProfileStrength` from `shared/utils/profileScoring.js`
- Import `buildReadinessLists` from `domains/talent/components/profileReadinessItems.js`
- Get `profile` and `images` from `useAuth()` (already available)
- Add a `useMemo` that computes `strength = calculateProfileStrength({ ...profile, images })`
- Derive `{ missingRequired, missingImprove, topGaps }` via `buildReadinessLists(strength.fieldCompletion)`
- Return (in addition to existing fields):
  - `fieldCompletion` — boolean map per field key
  - `topGaps` — top 3 items, required-first (already returned by `buildReadinessLists`)
  - `totalGaps` — `missingRequired.length + missingImprove.length`
  - `isRequiredComplete` — `strength.isRequiredComplete`

No API calls added. This is a pure client-side memoized computation from data already loaded.

### 2. Add URL mapping to `profileReadinessItems.js`

**File:** `client/src/domains/talent/components/profileReadinessItems.js`

Add a new export `READINESS_KEY_TO_PROFILE_URL` mapping each field key to the correct Profile deep-link:

| Keys | URL |
|------|-----|
| `name, city, dob, gender, bio` | `/dashboard/talent/profile?tab=identity` |
| `photo` | `/dashboard/talent/profile?tab=photos` |
| `height, measurements, weight, appearance, shoe, skin` | `/dashboard/talent/profile?tab=appearance` |
| `status` | `/dashboard/talent/profile?tab=roles` |
| `exp` | `/dashboard/talent/profile?tab=credits` |
| `training` | `/dashboard/talent/profile?tab=training` |
| `social` | `/dashboard/talent/profile?tab=socials` |
| `emergency` | `/dashboard/talent/profile?tab=contact` |

These tab values are handled by the Profile page's existing `sectionMap` → smooth scroll behavior.

### 3. Rewire `OverviewView` Audit card

**File:** `client/src/domains/talent/components/OverviewView.jsx`

- Remove `buildChecklist()` function entirely
- Remove `checklist` variable and its render block
- Import `useProfileStrength` and `READINESS_KEY_TO_PROFILE_URL`
- Use `useProfileStrength()` for both `readinessPct` (already reads from `completeness.percentage` — no change) and the new `topGaps` / `totalGaps`
- Render up to 3 `<Link>` items from `topGaps`:
  - Red dot + "Required" badge for `tier === 'required'`
  - Slate dot, no badge for `tier === 'improve'`
  - `to={READINESS_KEY_TO_PROFILE_URL[item.key]}`
- Below the 3 items, if `totalGaps > 3`, render a muted "+{totalGaps - 3} more" line
- "Continue Audit" `<Link to="/dashboard/talent/profile">` — label and destination unchanged

### 4. Skeleton / loading state

While `isLoading` from `useProfileStrength`, render 3 skeleton rows matching the existing `ov-skel` pattern so the card height stays stable.

---

## Data flow

```
useAuth() → { profile, images, completeness }
                    ↓
useProfileStrength() 
  → calculateProfileStrength({ ...profile, images })   [client-side, memoized]
  → buildReadinessLists(fieldCompletion)
  → returns: topGaps, totalGaps, isRequiredComplete
                    ↓
OverviewView — Audit card
  → renders topGaps[0..2] as Links
  → shows "+N more" if totalGaps > 3
  → "Continue Audit" links to /dashboard/talent/profile
```

---

## What is NOT changing

- CSS / visual design of the Audit card — no layout changes
- The Profile page audit panel — untouched
- `ProfileReadinessAudit.jsx` and `ProfileStrengthSidebar.jsx` — untouched
- "Continue Audit" destination — already `/dashboard/talent/profile`
- `completeness.percentage` display — still reads from `useAuth().completeness.percentage`

---

## Out of scope

- "Intro Reel" item — removed from checklist (it was always static/optional; not tracked in `fieldCompletion`)
- Animated step-through / guided audit flow — future work
- Audit state persistence — not needed; real-time from profile data
