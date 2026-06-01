# Functional Audit Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Overview tab's Audit card to real per-field profile completion data so each item reflects actual gaps and navigates directly to the relevant Profile section.

**Architecture:** Extend `useProfileStrength` to run `calculateProfileStrength` client-side (memoized), exposing `topGaps`, `totalGaps`, and `isRequiredComplete`. Add a URL-mapping export to `profileReadinessItems.js`. Replace `OverviewView`'s hardcoded `buildChecklist()` with data from the hook and render at most 3 real gap items as deep-linked `<Link>` elements.

**Tech Stack:** React 19, React Router v7, TanStack Query v5, existing `profileScoring.js` utility, existing `profileReadinessItems.js` utility

---

## File map

| File | Change |
|------|--------|
| `client/src/domains/talent/components/profileReadinessItems.js` | Add `READINESS_KEY_TO_PROFILE_URL` export |
| `client/src/domains/talent/hooks/useProfileStrength.js` | Add `fieldCompletion`, `topGaps`, `totalGaps`, `isRequiredComplete` to return |
| `client/src/domains/talent/components/OverviewView.jsx` | Remove `buildChecklist()`, wire `useProfileStrength`, new checklist render |
| `client/src/domains/talent/components/OverviewView.css` | Add `.ov-check-dot--improve` and `.ov-audit-more` rules |

---

## Task 1: Add profile URL mapping to profileReadinessItems.js

**Files:**
- Modify: `client/src/domains/talent/components/profileReadinessItems.js`

- [ ] **Step 1: Add the URL mapping export**

Open `client/src/domains/talent/components/profileReadinessItems.js`. After the existing `READINESS_KEY_TO_NAV_ID` export, add:

```js
/** Maps each readiness key to the Profile deep-link URL that scrolls to the correct section. */
export const READINESS_KEY_TO_PROFILE_URL = {
  name:         '/dashboard/talent/profile?tab=identity',
  city:         '/dashboard/talent/profile?tab=identity',
  dob:          '/dashboard/talent/profile?tab=identity',
  gender:       '/dashboard/talent/profile?tab=identity',
  bio:          '/dashboard/talent/profile?tab=identity',
  photo:        '/dashboard/talent/profile?tab=photos',
  height:       '/dashboard/talent/profile?tab=appearance',
  measurements: '/dashboard/talent/profile?tab=appearance',
  weight:       '/dashboard/talent/profile?tab=appearance',
  appearance:   '/dashboard/talent/profile?tab=appearance',
  shoe:         '/dashboard/talent/profile?tab=appearance',
  skin:         '/dashboard/talent/profile?tab=appearance',
  status:       '/dashboard/talent/profile?tab=roles',
  exp:          '/dashboard/talent/profile?tab=credits',
  training:     '/dashboard/talent/profile?tab=training',
  social:       '/dashboard/talent/profile?tab=socials',
  emergency:    '/dashboard/talent/profile?tab=contact',
};
```

The tab values (`identity`, `appearance`, `photos`, `roles`, `credits`, `training`, `socials`, `contact`) all exist in the Profile page's `sectionMap` and trigger smooth-scroll to the correct DOM section.

- [ ] **Step 2: Verify the file reads correctly**

Run: `node -e "const m = require('./client/src/domains/talent/components/profileReadinessItems.js'); console.log(Object.keys(m.READINESS_KEY_TO_PROFILE_URL).length)"` from the project root.

Expected: `17` (one entry per field key).

> Note: If the above command fails due to ESM vs CJS, just open the file visually and confirm all 17 keys are present.

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/components/profileReadinessItems.js
git commit -m "feat: add READINESS_KEY_TO_PROFILE_URL mapping for audit deep-links"
```

---

## Task 2: Extend useProfileStrength hook

**Files:**
- Modify: `client/src/domains/talent/hooks/useProfileStrength.js`

- [ ] **Step 1: Replace the hook with the extended version**

Overwrite `client/src/domains/talent/hooks/useProfileStrength.js` with:

```js
import { useMemo } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { calculateProfileStrength } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from '../components/profileReadinessItems';

/**
 * useProfileStrength Hook
 *
 * Provides the "official" profile strength score from the backend (score field)
 * and derives per-field gap data client-side for the audit UI.
 * Used by Header, Overview, and Sidebar headers.
 */
export function useProfileStrength() {
  const { completeness, profile, images, isLoading } = useAuth();

  const auditData = useMemo(() => {
    const strength = calculateProfileStrength({ ...profile, images: images ?? [] });
    const { missingRequired, missingImprove, topGaps } = buildReadinessLists(strength.fieldCompletion);
    return {
      fieldCompletion: strength.fieldCompletion,
      isRequiredComplete: strength.isRequiredComplete,
      topGaps,
      totalGaps: missingRequired.length + missingImprove.length,
    };
  }, [profile, images]);

  return {
    score: completeness?.percentage ?? 0,
    label: completeness?.label ?? 'Beginner',
    nextSteps: completeness?.nextSteps ?? [],
    coreReady: completeness?.coreReady ?? false,
    isComplete: completeness?.isComplete ?? false,
    isLoading,
    fieldCompletion: auditData.fieldCompletion,
    topGaps: auditData.topGaps,
    totalGaps: auditData.totalGaps,
    isRequiredComplete: auditData.isRequiredComplete,
  };
}
```

**Why this works:**
- `score` still reads from the backend `completeness.percentage` — unchanged for Header/Sidebar consumers.
- `auditData` memoizes on `profile` and `images` object references (TanStack Query returns stable references while data is fresh, and new references when data changes — exactly the right trigger for recomputation).
- No new API calls; both `profile` and `images` are already fetched by `useAuth`.

- [ ] **Step 2: Confirm existing consumers still work**

The hook's existing return shape is a superset of what it returned before. Existing consumers (`Header.jsx`) only destructure `{ score }` — they are unaffected. No changes needed in those files.

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/hooks/useProfileStrength.js
git commit -m "feat: extend useProfileStrength with fieldCompletion and topGaps"
```

---

## Task 3: Rewire OverviewView Audit card

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.jsx`
- Modify: `client/src/domains/talent/components/OverviewView.css`

- [ ] **Step 1: Add CSS for new dot variant and overflow line**

Open `client/src/domains/talent/components/OverviewView.css`. Find the existing dot variant block:

```css
.ov-check-dot--critical { background: #f87171; }
.ov-check-dot--success  { background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.35); }
.ov-check-dot--none     { background: rgba(255, 255, 255, 0.1); }
```

Add a new line immediately after the three existing dot variants:

```css
.ov-check-dot--improve  { background: rgba(255, 255, 255, 0.32); }
```

Then find `.ov-audit-cta` and add a new rule directly above it:

```css
.ov-audit-more {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ov-text-faint);
  text-align: center;
  margin: 0 0 8px;
}
```

- [ ] **Step 2: Add import for useProfileStrength and READINESS_KEY_TO_PROFILE_URL**

In `client/src/domains/talent/components/OverviewView.jsx`, the current imports include `useAuth`:

```js
import { useAuth } from '../../auth/hooks/useAuth';
```

Add two new imports directly after that line:

```js
import { useProfileStrength } from '../hooks/useProfileStrength';
import { READINESS_KEY_TO_PROFILE_URL } from './profileReadinessItems';
```

- [ ] **Step 3: Remove buildChecklist and wire useProfileStrength**

Find and delete the entire `buildChecklist` function (lines 42–80 in the original file):

```js
function buildChecklist(images, completeness, profile) {
  // ... entire function body ...
}
```

Delete it completely.

In the `OverviewView` component body, find:

```js
const checklist  = buildChecklist(images, completeness, profile);
```

Replace that line with:

```js
const { topGaps, totalGaps, isLoading: auditLoading } = useProfileStrength();
```

- [ ] **Step 4: Replace the checklist render block**

Find the existing checklist render (inside `{/* ── Readiness Guide ── */}`):

```jsx
<div className="ov-checklist" role="list">
  {checklist.map((item) => (
    <Link
      key={item.id}
      to={item.link}
      className="ov-check-item"
      role="listitem"
      aria-label={`${item.label}: ${item.status}`}
    >
      <div className="ov-check-left">
        <div
          className={`ov-check-dot ov-check-dot--${item.urgency}`}
          aria-hidden
        />
        <span className="ov-check-label">{item.label}</span>
      </div>
      <div className="ov-check-right">
        <span className="ov-check-status">{item.status}</span>
        <ChevronRight size={12} className="ov-check-arrow" aria-hidden />
      </div>
    </Link>
  ))}
</div>

<Link to="/dashboard/talent/profile" className="ov-audit-cta">
  Continue Audit
</Link>
```

Replace the entire block with:

```jsx
<div className="ov-checklist" role="list">
  {auditLoading ? (
    [0, 1, 2].map((i) => (
      <div key={i} className="ov-check-item" style={{ pointerEvents: 'none' }}>
        <div className="ov-check-left">
          <div
            className="ov-skel"
            style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
            aria-hidden
          />
          <div className="ov-skel ov-skel--line" style={{ width: 120 }} aria-hidden />
        </div>
      </div>
    ))
  ) : topGaps.map((item) => (
    <Link
      key={item.key}
      to={READINESS_KEY_TO_PROFILE_URL[item.key] ?? '/dashboard/talent/profile'}
      className="ov-check-item"
      role="listitem"
      aria-label={`${item.label}${item.tier === 'required' ? ': Required' : ''}`}
    >
      <div className="ov-check-left">
        <div
          className={`ov-check-dot ${item.tier === 'required' ? 'ov-check-dot--critical' : 'ov-check-dot--improve'}`}
          aria-hidden
        />
        <span className="ov-check-label">{item.label}</span>
      </div>
      <div className="ov-check-right">
        {item.tier === 'required' && (
          <span className="ov-check-status">Required</span>
        )}
        <ChevronRight size={12} className="ov-check-arrow" aria-hidden />
      </div>
    </Link>
  ))}
</div>

{!auditLoading && totalGaps > 3 && (
  <p className="ov-audit-more">+{totalGaps - 3} more</p>
)}

<Link to="/dashboard/talent/profile" className="ov-audit-cta">
  Continue Audit
</Link>
```

- [ ] **Step 5: Verify no dead code remains**

Confirm these are removed/unused after the edit:
- `buildChecklist` function — deleted
- `checklist` variable — deleted
- `images` and `completeness` are still destructured from `useAuth()` for the portfolio grid and visibility % — **do not remove them**

- [ ] **Step 6: Manual verification**

Start the dev server: `npm run dev:all`

Navigate to `http://localhost:5173/dashboard/talent` (login as `talent@example.com / password123` if needed).

Check the Audit card:
1. **Items reflect real data** — if the seed profile is incomplete, you should see actual missing fields (e.g. "Legal Name", "Height") instead of the static "Casting Polaroids / Digital Resume / Measurements & Specs / Intro Reel" list.
2. **Required items** have a red dot and "Required" badge on the right.
3. **Improve items** have a faint dot and no badge.
4. **Clicking an item** navigates to the Profile tab and the page smoothly scrolls to the correct section (e.g. clicking "Height" → goes to Profile → scrolls to the measurements section).
5. **+N more** line appears below the 3 items if the profile has more than 3 gaps total.
6. **Loading skeleton** — visible briefly on first load (3 placeholder rows).
7. **Complete profile** — if all fields are filled, `topGaps` is empty and the checklist renders nothing (the "Continue Audit" CTA still shows).

- [ ] **Step 7: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.jsx \
        client/src/domains/talent/components/OverviewView.css
git commit -m "feat: wire Overview Audit card to real profile gap data"
```
