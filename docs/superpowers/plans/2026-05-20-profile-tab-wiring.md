# Profile Tab Backend Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three frontend wiring gaps that prevent the Profile tab's readiness/completeness UI from working correctly.

**Architecture:** Hoist `calculateProfileStrength` to `ProfilePage/index.jsx`, pass the single result down to both `ProfileNav` (gap dots) and `ProfileStrengthSidebar` (score panel + audit panel). Add `auditOpen` state to ProfilePage and implement the full audit checklist panel in the sidebar.

**Tech Stack:** React 19 + react-hook-form, existing `profileScoring.js` / `profileReadinessItems.js`, CSS Modules.

---

## Phase 1 Audit — Backend Status

All Profile tab fields are **already wired to the backend**. No new endpoints or schema changes required:

| Section | Fields | Backend status |
|---------|--------|---------------|
| Identity | first_name, last_name, city, gender, date_of_birth, pronouns, bio | ✅ Saved to `profiles` via PUT |
| Heritage | ethnicity, nationality, place_of_birth, city_secondary | ✅ Saved |
| Measurements | height_cm, weight_kg, bust→bust_cm, waist→waist_cm, hips→hips_cm, shoe_size, inseam_cm, dress_size | ✅ Saved |
| Appearance | eye_color, hair_color, hair_length, hair_type, body_type, skin_tone, tattoos, piercings | ✅ Saved |
| Credits | experience_level, experience_details, training_summary→training | ✅ Saved |
| Skills | specialties, languages | ✅ Saved |
| Roles | work_status, union_membership, playing_age_min/max, comfort_levels, modeling_categories | ✅ Saved |
| Availability | availability_schedule, availability_travel, drivers_license, work_eligibility, passport_ready | ✅ Saved |
| Representation | seeking_representation, current_agency, previous_representations | ✅ Saved |
| Socials | instagram_handle, tiktok_handle, twitter_handle, youtube_handle, portfolio_url, video_reel_url | ✅ Saved |
| Emergency | emergency_contact_name, emergency_contact_phone, emergency_contact_relationship | ✅ Saved |
| Photos | Handled by separate `PUT /api/talent/media/:id/hero` | ✅ Wired |

**Three frontend wiring gaps to fix:**
1. `fieldCompletion` never passed to `ProfileNav` → nav gap dots always hidden
2. `auditOpen` / `onToggleAudit` never passed to `ProfileStrengthSidebar` → checklist toggle is dead
3. Profile strength computed twice (ProfilePage + Sidebar independently) → hoist to one call
4. Audit panel content never rendered in `ProfileStrengthSidebar` → even if toggle worked, nothing would show

---

## File Map

| File | Change |
|------|--------|
| `client/src/domains/talent/pages/ProfilePage/index.jsx` | Hoist strength calc, add `auditOpen` state, pass `fieldCompletion` + audit props |
| `client/src/domains/talent/components/ProfileStrengthSidebar.jsx` | Accept pre-computed `strength` prop, render full audit checklist panel |
| `client/src/domains/talent/components/ProfileStrengthSidebar.module.css` | Add audit panel styles |

---

## Task 1: Hoist strength calculation + pass fieldCompletion to ProfileNav

**Files:**
- Modify: `client/src/domains/talent/pages/ProfilePage/index.jsx`

- [ ] **Step 1: Replace the inline `calculateProfileStrength` destructure with a full `liveStrength` variable**

In `ProfilePage/index.jsx`, find the existing call (around line 408):

```js
const { isCoreReady, missingCoreItems } = calculateProfileStrength(strengthValues);
```

Replace with:

```js
const liveStrength = useMemo(
  () => calculateProfileStrength(strengthValues),
  [strengthValues],
);
const { isCoreReady, missingCoreItems } = liveStrength;
```

- [ ] **Step 2: Pass `fieldCompletion` to `ProfileNav`**

Find the `<ProfileNav>` render (around line 716):

```jsx
<ProfileNav 
  onNavClick={() => setNavOpen(false)} 
  activeSection={activeSection} 
/>
```

Replace with:

```jsx
<ProfileNav
  onNavClick={() => setNavOpen(false)}
  activeSection={activeSection}
  fieldCompletion={liveStrength.fieldCompletion}
/>
```

- [ ] **Step 3: Verify by running the dev server and checking the nav gap dots appear**

```bash
npm run dev:all
```

Navigate to `/dashboard/talent/profile` — the nav items for incomplete sections should now show a small dot indicator.

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/talent/pages/ProfilePage/index.jsx
git commit -m "fix(profile): pass fieldCompletion to ProfileNav so gap dots render"
```

---

## Task 2: Add auditOpen state + wire it to ProfileStrengthSidebar

**Files:**
- Modify: `client/src/domains/talent/pages/ProfilePage/index.jsx`

- [ ] **Step 1: Add `auditOpen` state to ProfilePage**

After the existing `useState` declarations (around line 217):

```js
const [auditOpen, setAuditOpen] = useState(false);
```

- [ ] **Step 2: Update the `<ProfileStrengthSidebar>` props**

Find the existing render (around line 1149):

```jsx
<ProfileStrengthSidebar 
  values={strengthValues}
  isSaving={isSubmitting}
  isDisabled={!isDirty || isSubmitting}
  onSaveClick={() => {
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix validation errors before saving');
    }
  }}
  onItemClick={(sectionId) => { ... }}
/>
```

Replace with:

```jsx
<ProfileStrengthSidebar
  strength={liveStrength}
  isSaving={isSubmitting}
  isDisabled={!isDirty || isSubmitting}
  onSaveClick={() => {
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix validation errors before saving');
    }
  }}
  onItemClick={(sectionId) => {
    const goPhotos = sectionId === 'photos-tab' || sectionId === 'hero-section';
    if (goPhotos) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'photos');
        return next;
      });
      window.setTimeout(() => {
        const el = document.getElementById('photos-tab');
        if (el) {
          const offset = 100;
          const top = el.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }, 400);
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  }}
  auditOpen={auditOpen}
  onToggleAudit={() => setAuditOpen((v) => !v)}
/>
```

Note: we switched from `values={strengthValues}` to `strength={liveStrength}` — this will require updating the sidebar component in Task 3.

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/ProfilePage/index.jsx
git commit -m "fix(profile): add auditOpen state and wire to ProfileStrengthSidebar"
```

---

## Task 3: Update ProfileStrengthSidebar to accept pre-computed strength + render audit panel

**Files:**
- Modify: `client/src/domains/talent/components/ProfileStrengthSidebar.jsx`
- Modify: `client/src/domains/talent/components/ProfileStrengthSidebar.module.css`

- [ ] **Step 1: Replace the internal `useMemo` computation with the incoming `strength` prop**

In `ProfileStrengthSidebar.jsx`, replace:

```js
import { calculateProfileStrength, getStrengthUI } from '../../../shared/utils/profileScoring';
```

with:

```js
import { getStrengthUI } from '../../../shared/utils/profileScoring';
```

Then replace the function signature and internal computation:

**Old:**
```js
export default function ProfileStrengthSidebar({
  values,
  isSaving,
  isDisabled,
  onSaveClick,
  onItemClick,
  auditOpen,
  onToggleAudit,
}) {
  const liveStrength = useMemo(() => calculateProfileStrength(values), [values]);

  const { score, isRequiredComplete, fieldCompletion, scrollTargetByKey } = liveStrength;
```

**New:**
```js
export default function ProfileStrengthSidebar({
  strength,
  isSaving,
  isDisabled,
  onSaveClick,
  onItemClick,
  auditOpen,
  onToggleAudit,
}) {
  const { score, isRequiredComplete, fieldCompletion, scrollTargetByKey } = strength;
```

Also remove the `useMemo` import if it's only used for the removed computation.

- [ ] **Step 2: Add the full audit checklist panel**

In `ProfileStrengthSidebar.jsx`, import the readiness lists:

```js
import {
  buildReadinessLists,
  buildNavGapBySection,
  REQUIRED_READINESS_ITEMS,
  IMPROVE_READINESS_ITEMS,
} from './profileReadinessItems';
```

After the existing `{totalGaps > 0 && ( <button ...auditToggle... /> )}` block, add the audit panel:

```jsx
{auditOpen && totalGaps > 0 && (
  <div className={styles.auditPanel} role="region" aria-label="Full profile checklist">
    {missingRequired.length > 0 && (
      <div className={styles.auditSection}>
        <p className={styles.auditSectionLabel}>Required</p>
        {missingRequired.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.gapItem}
            onClick={() => {
              const target = scrollTargetByKey[item.key];
              if (target) onItemClick?.(target);
            }}
          >
            <span className={`${styles.dot} ${styles.dotRed}`} aria-hidden="true" />
            <span className={styles.gapLabel}>{item.label}</span>
            <span className={styles.badgeRed}>Required</span>
          </button>
        ))}
      </div>
    )}
    {missingImprove.length > 0 && (
      <div className={styles.auditSection}>
        <p className={styles.auditSectionLabel}>Improve</p>
        {missingImprove.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.gapItem}
            onClick={() => {
              const target = scrollTargetByKey[item.key];
              if (target) onItemClick?.(target);
            }}
          >
            <span className={`${styles.dot} ${styles.dotSlate}`} aria-hidden="true" />
            <span className={styles.gapLabel}>{item.label}</span>
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Add CSS for audit panel in ProfileStrengthSidebar.module.css**

Open `ProfileStrengthSidebar.module.css` and append:

```css
/* Audit panel */
.auditPanel {
  margin-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auditSection {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auditSectionLabel {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 4px;
}
```

- [ ] **Step 4: Check the sidebar still renders with no errors**

Run:

```bash
cd client && npm run lint
```

Expected: no new lint errors related to the changed files.

- [ ] **Step 5: Commit**

```bash
git add client/src/domains/talent/components/ProfileStrengthSidebar.jsx \
        client/src/domains/talent/components/ProfileStrengthSidebar.module.css
git commit -m "feat(profile): implement audit panel in ProfileStrengthSidebar"
```

---

## Task 4: End-to-end smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev:all
```

- [ ] **Step 2: Log in as the talent test user and navigate to the Profile tab**

Seed credentials: `talent@example.com` / `password123`

Navigate to: `http://localhost:5173/dashboard/talent/profile`

- [ ] **Step 3: Verify the following work correctly**

- [ ] Nav gap dots appear on sections with missing fields
- [ ] "View full checklist" button opens the audit panel
- [ ] Clicking an item in the audit panel scrolls to that section
- [ ] Editing a field (e.g., filling in Emergency Contact name) causes that item to disappear from the audit panel
- [ ] Saving the form (`Save profile` button) persists data — reload the page and confirm values are still there
- [ ] The hero stats line in the page header updates as you type (city, work_status, hair_color, eye_color)

- [ ] **Step 4: Test the Photos sub-tab**

- [ ] Click `?tab=photos` (or Photos in the nav) — confirms photo upload section renders
- [ ] Upload a photo and confirm it becomes the hero image on the profile header

- [ ] **Step 5: Test backend save for each section**

Using browser devtools Network tab, confirm PUT `/api/talent/profile` returns `200` with a `profile` object that contains the saved fields.

---

## Self-Review Checklist

**Spec coverage:**
- [x] `fieldCompletion` passed to `ProfileNav` → Task 1
- [x] `auditOpen` state managed in `ProfilePage` → Task 2
- [x] `ProfileStrengthSidebar` accepts pre-computed `strength` → Task 3
- [x] Audit panel renders full checklist → Task 3
- [x] Smoke tests for data persistence → Task 4

**Placeholder scan:** No TBDs or "fill in later" items — all code blocks are complete.

**Type consistency:**
- `liveStrength` returned by `calculateProfileStrength` — shape is `{ score, isRequiredComplete, fieldCompletion, scrollTargetByKey, isCoreReady, missingCoreItems, nextSteps, ... }`
- `strength` prop name used consistently in Task 2 (parent) and Task 3 (sidebar)
- `buildReadinessLists` returns `{ requiredItems, improveItems, missingRequired, missingImprove, topGaps }` — used in Task 3
