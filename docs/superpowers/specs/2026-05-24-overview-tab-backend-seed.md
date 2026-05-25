# Overview Tab Backend & Demo Seed — Design Spec

**Date:** 2026-05-24  
**Scope:** Backend fixes for the talent dashboard Overview tab + comprehensive seed data for `talent@example.com`

---

## Problem Statement

The Overview tab frontend is fully built. Three gaps prevent it from feeling complete:

1. **`summary` response shape mismatch** — `GET /api/talent/summary` returns `views.change` as a string (`"+15%"`). The `useAnalytics` hook looks for `views.changePct` (number). Trend deltas are always 0.
2. **`overview` activity stream is always empty** — `GET /api/talent/overview` has a dead try-block returning `activityStream: []` instead of querying the `activities` table.
3. **Zero demo data** — `npm run seed` produces profiles with no analytics, activities, visitor sessions, or applications. The dashboard looks dead on first launch.

---

## Approach

**Option A (chosen):** Two targeted backend fixes + one `seedDemoData()` helper function in `seeds/seed.js`. Single command (`npm run seed`) produces a fully live demo.

---

## Section 1 — Backend Fixes

### Fix 1: `summary` endpoint — numeric `changePct`

**File:** `src/domains/talent/routes/analytics.js`  
**Route:** `GET /api/talent/summary`

The `calcTrend()` helper currently returns `{ change: "+15%", trend: "up" }`. Add a `changePct` field as a bare integer:

```js
// calcTrend result:
{
  change: "+15%",   // keep for backward compat
  changePct: 15,    // NEW: numeric form for useAnalytics hook
  trend: "up"
}
```

Apply to both `viewsTrend` and `downloadsTrend` in the response. The `OverviewPage.jsx` already handles both string and number forms via `parseChangePct(summary?.views?.changePct ?? summary?.views?.change)` so nothing regresses.

### Fix 2: `overview` endpoint — real activity stream

**File:** `src/domains/talent/routes/dashboard.js`  
**Route:** `GET /api/talent/overview`

Replace the empty try-block with the same activity query used by `GET /api/talent/activity`:

```js
activityStream = await knex("activities")
  .where({ user_id: userId })
  .orderBy("created_at", "desc")
  .limit(5)
  .then(rows => rows.map(formatActivity)); // same formatter as /activity route
```

The `formatActivity` logic (switch on `activity_type` → message + icon) should be extracted to a shared helper to avoid duplication.

---

## Section 2 — Demo Account: Mia Voss

**Account:** `talent@example.com` / `password123`  
**Tier:** Studio+ (`is_pro: true`)

### Profile fields

| Field | Value |
|-------|-------|
| first_name | Mia |
| last_name | Voss |
| slug | mia-voss |
| city | Los Angeles, CA |
| height_cm | 178 |
| weight_kg | 57 |
| bust_cm | 81, waist_cm: 61, hips_cm: 88 |
| dress_size | 4 |
| shoe_size | 8 US |
| hair_color | Dark Brown |
| eye_color | Hazel |
| skin_tone | Medium |
| gender | Female |
| date_of_birth | 1997-04-12 |
| experience_level | Experienced |
| specialties | ['Editorial', 'Commercial', 'Runway'] |
| languages | ['English', 'French'] |
| instagram_handle | miavoss |
| portfolio_url | https://miavoss.com |
| bio_curated | "Mia Voss is a Los Angeles-based editorial and commercial model with over six years of campaign and runway experience. Known for her ability to shift between high-fashion editorial and warm commercial presence, she's represented across three continents." |
| is_pro | true |

### Images (6 Unsplash, public HTTPS)

| Sort | Label | URL |
|------|-------|-----|
| 1 | Headshot | `https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1000&q=80` |
| 2 | Editorial | `https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1000&q=80` |
| 3 | Runway | `https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80` |
| 4 | Commercial | `https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=80` |
| 5 | Editorial 2 | `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=1000&q=80` |
| 6 | Lifestyle | `https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1000&q=80` |

---

## Section 3 — Agencies & Applications

**8 seeded agencies** (stable seeded UUIDs, realistic names):

1. Wilhelmina Models — New York
2. IMG Models — New York
3. Elite Model Management — Paris
4. Ford Models — New York
5. DNA Model Management — Los Angeles
6. The Society Management — Los Angeles
7. Next Management — New York
8. Marilyn Agency — Paris

**7 applications** for Mia Voss:

| Agency | Status | Created |
|--------|--------|---------|
| Wilhelmina Models | reviewing | 3 days ago |
| Next Management | pending | 5 days ago |
| IMG Models | accepted | 14 days ago |
| Elite Model Management | pending | 21 days ago |
| Ford Models | reviewing | 28 days ago |
| DNA Model Management | rejected | 45 days ago |
| The Society Management | pending | 7 days ago |

Seeded via `knex("applications").insert(...)`. The "Submissions" KPI on the Overview tab counts all 7. The accepted/rejected statuses make the list feel like a real history.

---

## Section 4 — Analytics Data (90 days)

**Target volume:** ~350–500 view events, ~40–60 downloads, realistic engagement  

**Pattern:** bell curve with recency boost + weekend spikes  
- Base: 3–8 views/day, trending to 8–15/day in last 30 days
- Weekend multiplier: 1.4×
- 15 unique visitor IDs (70% returning / 30% new)
- Source breakdown: 45% Instagram, 30% direct, 15% Google, 10% other

**Event types seeded per view:**
- `view` — always
- `bio_read` — 65% of sessions
- `social_click` — 25% of sessions
- `portfolio_click` — 20% of sessions
- `scroll_depth` — 50% of sessions
- `download` — 12% of sessions (with theme: 'editorial' | 'minimal' | 'bold')

**Visitor sessions:** one `visitor_sessions` row per view event (same pattern).

**Previous period (days 60–90):** slightly lower volume (~60% of current period) so `changePct` computes as a positive +25–40% trend.

---

## Section 5 — Activities Feed (30 days)

**25 activity entries** for `talent@example.com`, covering:

- `image_uploaded` (imageCount: 1–3) — 6 entries
- `profile_updated` (fields: ['bio', 'measurements', 'instagram_handle']) — 5 entries
- `pdf_downloaded` (theme: 'editorial' | 'minimal' | 'bold') — 6 entries
- `portfolio_viewed` (source: 'direct' | 'instagram') — 5 entries
- `submission_package_created` (imageCount: 4–6) — 3 entries

Spread across 30 days, 1–3/day, with recent days having more entries to make the feed feel alive.

---

## Implementation Plan

1. **`seeds/seed.js`** — Replace `talent@example.com` profile insert with Mia Voss, add `seedDemoData(knex, talentId, profileId)` helper called at end of seed function
2. **`src/domains/talent/routes/analytics.js`** — Add `changePct` integer to `calcTrend()` return, apply to `viewsTrend` and `downloadsTrend` in `/summary` response
3. **`src/domains/talent/routes/dashboard.js`** — Wire `activityStream` to real `activities` table query, extract shared `formatActivity` helper

### Idempotency

`seeds/seed.js` already DELETEs all rows before inserting. The demo seed is part of the same transaction, so re-running `npm run seed` always produces a clean, consistent state.

### Referential integrity

Agency rows inserted before applications. `applications.agency_id` FK satisfied. All UUIDs are `uuidv4()` generated at seed time (not hardcoded), so no collision risk.

---

## Files Changed

| File | Change |
|------|--------|
| `seeds/seed.js` | Enrich talent profile → Mia Voss; add `seedDemoData()` helper |
| `src/domains/talent/routes/analytics.js` | Add `changePct` to `calcTrend()` + `/summary` response |
| `src/domains/talent/routes/dashboard.js` | Wire `activityStream` to real data |

No migrations required — all tables already exist.
