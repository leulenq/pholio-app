# Codebase Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Pholio app codebase from flat layer-based organization into domain-first vertical slices (talent, agency, auth, onboarding, pdf, ai) — backend and frontend — while keeping the app working after every commit.

**Architecture:** Five sequential phases: purge dead code, restructure backend into `src/domains/`, restructure frontend into `client/src/domains/`, decompose megafiles into page directories, then cleanup/docs. Each phase ends with a verified working app.

**Tech Stack:** Node.js/Express (CommonJS), React 19/Vite (ESM), Knex.js, Firebase Auth, TanStack Query v5

**Spec:** `docs/superpowers/specs/2026-03-23-codebase-reorganization-design.md`

---

## Phase 1: Purge Dead Code

### Task 1.1: Preserve archive on a branch, then delete

**Files:**
- Delete: `archive/` (entire directory)

- [ ] **Step 1: Create archive branch**

```bash
git checkout -b archive/legacy
git checkout main
```

- [ ] **Step 2: Delete archive directory**

```bash
rm -rf archive/
```

- [ ] **Step 3: Verify app still boots**

```bash
npm run dev:all
# Wait for "Server running on port 3000" + Vite ready, then Ctrl+C
```

- [ ] **Step 4: Commit**

```bash
git add -A archive/
git commit -m "chore: remove archive/ directory (preserved on archive/legacy branch)"
```

---

### Task 1.2: Delete backup files and build artifacts

**Files:**
- Delete: `client/src/styles/global.css.bak`
- Delete: `client/tailwind.config.js.bak`
- Delete: `src/lib/dashboard/completeness-old.js.backup`
- Delete: `src/routes/agency.js.backup`
- Delete: `client/build_error.txt`

- [ ] **Step 1: Delete all backup files**

```bash
rm -f client/src/styles/global.css.bak
rm -f client/tailwind.config.js.bak
rm -f src/lib/dashboard/completeness-old.js.backup
rm -f src/routes/agency.js.backup
rm -f client/build_error.txt
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: delete backup files and build artifacts"
```

---

### Task 1.3: Delete dead marketing/demo code from public/

**Files:**
- Delete: `public/STUDIO+_WEBSITE/` (entire directory)
- Delete: `public/react-background-remover-master/` (entire directory)

- [ ] **Step 1: Delete directories**

```bash
rm -rf "public/STUDIO+_WEBSITE"
rm -rf public/react-background-remover-master
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove dead marketing and demo code from public/"
```

---

### Task 1.4: Delete legacy dashboard-talent SSR routes

These routes render EJS templates for talent dashboard pages. The React SPA has fully replaced them. No frontend code imports from these. The variable `dashboardTalentRoutes` in `app.js` points at `routes/talent/index.js` (the SPA catch-all), NOT at `dashboard-talent/`. Safe to delete.

**Files:**
- Delete: `src/routes/dashboard-talent/` (6 files: index.js, profile.js, media.js, analytics.js, applications.js, settings.js)
- Verify: `src/lib/dashboard/shared-utils.js` and `src/lib/dashboard/template-helpers.js` are only used by dashboard-talent routes

- [ ] **Step 1: Check no other files import from dashboard-talent**

```bash
grep -r "dashboard-talent" src/ --include="*.js" -l
# Expected: only files inside src/routes/dashboard-talent/ itself
```

- [ ] **Step 2: Check if shared-utils.js and template-helpers.js are used outside dashboard-talent**

```bash
grep -r "shared-utils\|template-helpers" src/ --include="*.js" -l
# Expected: only src/routes/dashboard-talent/*.js and src/lib/dashboard/ itself
```

- [ ] **Step 3: Delete the files**

```bash
rm -rf src/routes/dashboard-talent/
rm -f src/lib/dashboard/shared-utils.js
rm -f src/lib/dashboard/template-helpers.js
```

Note: If step 2 shows other importers, do NOT delete shared-utils/template-helpers yet — move them to shared/lib instead.

- [ ] **Step 4: Verify app boots**

```bash
npm run dev:all
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove legacy dashboard-talent SSR routes and unused helpers"
```

---

### Task 1.5: Delete legacy onboarding state machine and duplicate config

**Files:**
- Delete: `src/lib/onboarding/state-machine.js` (legacy, replaced by casting-machine.js)
- Delete: `src/lib/config.js` (duplicate of `src/config.js`)

- [ ] **Step 1: Verify state-machine.js is not imported anywhere**

```bash
grep -r "onboarding/state-machine\|state-machine" src/ --include="*.js" -l
# Expected: no results (or only the file itself)
```

- [ ] **Step 2: Verify lib/config.js is not imported (or update importers to use src/config.js)**

```bash
grep -r "require.*lib/config" src/ --include="*.js" -l
# If any files import lib/config.js, update them to import ../config or ../../config instead
```

- [ ] **Step 3: Delete files**

```bash
rm -f src/lib/onboarding/state-machine.js
rm -f src/lib/config.js
```

- [ ] **Step 4: Verify app boots + run tests**

```bash
npm run dev:all
npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove legacy state machine and duplicate config"
```

---

### Task 1.6: Delete stub pages, orphaned CSS, and marketing pages

**Files:**
- Delete: `client/src/routes/agency/InterviewsPage.jsx` + `InterviewsPage.css`
- Delete: `client/src/routes/agency/RemindersPage.jsx` + `RemindersPage.css`
- Delete: `client/src/routes/agency/SignedPage.jsx` + `SignedPage.css`
- Delete: `client/src/routes/agency/PlaceholderPage.css`
- Delete: `client/src/routes/PricingPage.jsx`
- Delete: `client/src/features/applicants/` (dead, replaced by InboxPage)
- Delete: `client/src/styles/public.css` (19,799 line duplicate of global.css)
- Delete: `client/src/layouts/DashboardLayout.jsx` (legacy wrapper)
- Modify: `client/src/App.jsx` — remove routes + imports for deleted pages

- [ ] **Step 1: Delete the files**

```bash
rm -f client/src/routes/agency/InterviewsPage.jsx client/src/routes/agency/InterviewsPage.css
rm -f client/src/routes/agency/RemindersPage.jsx client/src/routes/agency/RemindersPage.css
rm -f client/src/routes/agency/SignedPage.jsx client/src/routes/agency/SignedPage.css
rm -f client/src/routes/agency/PlaceholderPage.css
rm -f client/src/routes/PricingPage.jsx
rm -rf client/src/features/applicants/
rm -f client/src/styles/public.css
rm -f client/src/layouts/DashboardLayout.jsx
```

- [ ] **Step 2: Update App.jsx — remove deleted imports and routes**

Remove these imports from `client/src/App.jsx`:
```javascript
// DELETE these lines:
import DashboardPricingPage from './routes/PricingPage';
import AgencyInterviews from './routes/agency/InterviewsPage';
import AgencyReminders from './routes/agency/RemindersPage';
// Note: SignedPage is not imported in current App.jsx, but grep to confirm
```

Remove these routes from the `<Routes>` block:
```jsx
// DELETE these lines:
<Route path="/dashboard/agency/interviews" element={<AgencyInterviews />} />
<Route path="/dashboard/agency/reminders" element={<AgencyReminders />} />
<Route path="/pricing" element={<DashboardPricingPage />} />
```

Also check: if `AgencyApplicants` is still imported but only used as a redirect to inbox, keep the redirect but remove the import if redundant.

- [ ] **Step 3: Verify frontend builds + boots**

```bash
cd client && npm run build && cd ..
npm run dev:all
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete stub pages, orphaned CSS, marketing pages, and dead applicants feature"
```

---

### Task 1.7: Add .DS_Store to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Check if .DS_Store is already in .gitignore**

```bash
grep "DS_Store" .gitignore
```

- [ ] **Step 2: Add if missing, then remove tracked .DS_Store files**

```bash
echo ".DS_Store" >> .gitignore
git rm -r --cached '*.DS_Store' 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: gitignore .DS_Store files"
```

---

## Phase 2: Backend Restructure

### Task 2.1: Create backend directory skeleton

**Files:**
- Create directories only (no file moves yet)

- [ ] **Step 1: Create all domain directories**

```bash
mkdir -p src/domains/talent/{routes,queries,services,validation}
mkdir -p src/domains/agency/{routes,queries,services,validation}
mkdir -p src/domains/auth/{routes,middleware,services}
mkdir -p src/domains/onboarding/{routes,services/providers,analytics,validation}
mkdir -p src/domains/pdf/{routes,templates}
mkdir -p src/domains/ai
mkdir -p src/shared/{middleware,lib,db}
```

- [ ] **Step 2: Commit skeleton**

```bash
# Add .gitkeep files so empty dirs are tracked
find src/domains src/shared -type d -empty -exec touch {}/.gitkeep \;
git add src/domains/ src/shared/
git commit -m "chore: create backend domain directory skeleton"
```

---

### Task 2.2: Move shared infrastructure (db, middleware, lib)

Move files that have zero domain-specific logic. Update imports in every file that references the old paths.

**Files:**
- Move: `src/db/knex.js` → `src/shared/db/knex.js`
- Move: `src/middleware/error-handler.js` → `src/shared/middleware/error-handler.js`
- Move: `src/middleware/context.js` → `src/shared/middleware/context.js`
- Move: `src/middleware/onboarding-redirect.js` → `src/shared/middleware/onboarding-redirect.js`
- Move: `src/middleware/require-profile-unlocked.js` → `src/shared/middleware/require-profile-unlocked.js`
- Move shared libs: `uploader.js`, `email.js`, `stripe.js`, `subscriptions.js`, `geolocation.js`, `storage.js`, `slugify.js`, `sanitize.js`, `image-validator.js`, `api-response.js`, `user-helpers.js`, `curate.js`, `schemas.js` → `src/shared/lib/`

- [ ] **Step 1: Move db**

```bash
mv src/db/knex.js src/shared/db/knex.js
rmdir src/db
```

Then update ALL files that `require('./db/knex')` or `require('../db/knex')` etc. Use:

```bash
grep -rn "require.*db/knex" src/ --include="*.js"
```

Update each match to point to `src/shared/db/knex.js` using the correct relative path.

- [ ] **Step 2: Move shared middleware**

```bash
mv src/middleware/error-handler.js src/shared/middleware/
mv src/middleware/context.js src/shared/middleware/
mv src/middleware/onboarding-redirect.js src/shared/middleware/
mv src/middleware/require-profile-unlocked.js src/shared/middleware/
```

Update imports:
```bash
grep -rn "require.*middleware/error-handler\|require.*middleware/context\|require.*middleware/onboarding-redirect\|require.*middleware/require-profile-unlocked" src/ --include="*.js"
```

- [ ] **Step 3: Move shared libs (one batch)**

```bash
for f in uploader.js email.js stripe.js subscriptions.js geolocation.js storage.js slugify.js sanitize.js image-validator.js api-response.js user-helpers.js curate.js schemas.js; do
  mv "src/lib/$f" "src/shared/lib/$f"
done
```

Update imports for each moved file:
```bash
grep -rn "require.*lib/uploader\|require.*lib/email\|require.*lib/stripe\b" src/ --include="*.js"
# Repeat for each file
```

- [ ] **Step 4: Verify app boots + tests pass**

```bash
npm test
npm run dev:all
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move shared infrastructure to src/shared/"
```

---

### Task 2.3: Move AI domain

Leaf node — depends only on shared.

**Files:**
- Move: `src/lib/ai/groq-casting.js` → `src/domains/ai/groq-casting.js`
- Move: `src/lib/ai/photo-analysis.js` + `analyzeProfileImage.js` + `photo-analysis-interface.js` → `src/domains/ai/photo-analysis.js` (merge)
- Move: `src/lib/ai/embeddings.js` → `src/domains/ai/embeddings.js`
- Move: `src/lib/ai/archetypes.js` → `src/domains/ai/archetypes.js`
- Move: `src/lib/ai/imageScoring.js` → `src/domains/ai/scoring.js`

- [ ] **Step 1: Move files (simple moves first, merge later)**

```bash
mv src/lib/ai/groq-casting.js src/domains/ai/
mv src/lib/ai/embeddings.js src/domains/ai/
mv src/lib/ai/archetypes.js src/domains/ai/
mv src/lib/ai/imageScoring.js src/domains/ai/scoring.js
```

- [ ] **Step 2: Merge photo-analysis files**

Read `photo-analysis.js`, `analyzeProfileImage.js`, and `photo-analysis-interface.js`. Combine into a single `src/domains/ai/photo-analysis.js` that exports all public functions. Delete originals.

```bash
rm src/lib/ai/photo-analysis.js src/lib/ai/analyzeProfileImage.js src/lib/ai/photo-analysis-interface.js
rmdir src/lib/ai
```

- [ ] **Step 3: Update all imports**

```bash
grep -rn "require.*lib/ai/" src/ --include="*.js"
```

Update each to point at `src/domains/ai/`.

- [ ] **Step 4: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: move AI module to src/domains/ai/"
```

---

### Task 2.4: Move PDF domain

**Files:**
- Move: `src/routes/pdf.js` → `src/domains/pdf/routes/pdf.js`
- Move: `src/lib/pdf.js` → `src/domains/pdf/generator.js`
- Move: `src/lib/pdf-layouts.js` → `src/domains/pdf/layouts.js`
- Move: `src/lib/fonts.js` → `src/domains/pdf/fonts.js`
- Move: `src/lib/themes.js` + `src/lib/color-palettes.js` → `src/domains/pdf/themes.js` (merge)
- Move: `src/lib/comp-card-selector.js` → `src/domains/pdf/comp-card-selector.js`
- Move: `views/pdf/compcard.ejs` + `views/pdf/compcard-standard.ejs` → `src/domains/pdf/templates/`

- [ ] **Step 1: Move simple files**

```bash
mv src/lib/pdf.js src/domains/pdf/generator.js
mv src/lib/pdf-layouts.js src/domains/pdf/layouts.js
mv src/lib/fonts.js src/domains/pdf/fonts.js
mv src/lib/comp-card-selector.js src/domains/pdf/comp-card-selector.js
mv src/routes/pdf.js src/domains/pdf/routes/pdf.js
mv views/pdf/compcard.ejs src/domains/pdf/templates/
mv views/pdf/compcard-standard.ejs src/domains/pdf/templates/
```

- [ ] **Step 2: Merge themes.js + color-palettes.js**

Read both files. Combine into `src/domains/pdf/themes.js` — keep all exports. Delete originals.

```bash
rm src/lib/themes.js src/lib/color-palettes.js
```

- [ ] **Step 3: Update all imports + EJS template paths in generator**

```bash
grep -rn "require.*lib/pdf\b\|require.*lib/fonts\|require.*lib/themes\|require.*lib/color-palettes\|require.*lib/pdf-layouts\|require.*lib/comp-card-selector" src/ --include="*.js"
grep -rn "views/pdf" src/ --include="*.js"
```

Update the EJS `res.render()` or `ejs.renderFile()` calls to use the new template path.

- [ ] **Step 4: Update app.js mount for PDF routes**

In `src/app.js`, change:
```javascript
// OLD:
const pdfRoutes = require('./routes/pdf');
// NEW:
const pdfRoutes = require('./domains/pdf/routes/pdf');
```

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: move PDF system to src/domains/pdf/"
```

---

### Task 2.5: Move Auth domain

**Files:**
- Move: `src/routes/auth.js` → `src/domains/auth/routes/auth.js`
- Move: `src/middleware/auth.js` → `src/domains/auth/middleware/require-auth.js`
- Move: `src/middleware/firebase-auth.js` → `src/domains/auth/middleware/firebase-auth.js`
- Move: `src/middleware/session-validator.js` → `src/domains/auth/middleware/session-validator.js`
- Move: `src/lib/firebase-admin.js` → `src/domains/auth/services/firebase-admin.js`

- [ ] **Step 1: Move files**

```bash
mv src/routes/auth.js src/domains/auth/routes/
mv src/middleware/auth.js src/domains/auth/middleware/require-auth.js
mv src/middleware/firebase-auth.js src/domains/auth/middleware/
mv src/middleware/session-validator.js src/domains/auth/middleware/
mv src/lib/firebase-admin.js src/domains/auth/services/
```

- [ ] **Step 2: Update all imports**

This is the highest-impact move — `requireAuth`, `requireRole`, and `firebase-admin` are imported across nearly every route file.

```bash
grep -rn "require.*middleware/auth\b" src/ --include="*.js"
grep -rn "require.*lib/firebase-admin" src/ --include="*.js"
grep -rn "require.*middleware/firebase-auth" src/ --include="*.js"
grep -rn "require.*middleware/session-validator" src/ --include="*.js"
```

Update every match. The auth middleware rename (`auth.js` → `require-auth.js`) means updating destructured imports:
```javascript
// OLD: const { requireAuth, requireRole } = require('../middleware/auth');
// NEW: const { requireAuth, requireRole } = require('../domains/auth/middleware/require-auth');
```

- [ ] **Step 3: Update app.js**

```javascript
// OLD:
const authRoutes = require('./routes/auth');
// NEW:
const authRoutes = require('./domains/auth/routes/auth');
```

- [ ] **Step 4: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: move auth system to src/domains/auth/"
```

---

### Task 2.6: Move Onboarding domain

**Files:**
- Move: `src/routes/onboarding.js` → `src/domains/onboarding/routes/casting.js`
- Move: `src/routes/apply_essentials.js` → `src/domains/onboarding/routes/apply-essentials.js`
- Move: `src/lib/onboarding/casting-machine.js` → `src/domains/onboarding/services/state-machine.js`
- Move: `src/lib/onboarding/referral.js` → `src/domains/onboarding/services/referral.js`
- Move: `src/lib/onboarding/signal-collector.js` → `src/domains/onboarding/services/signal-collector.js`
- Move: `src/lib/onboarding/auth-helpers.js` → `src/domains/onboarding/services/auth-helpers.js`
- Move: `src/lib/onboarding/application-helpers.js` → `src/domains/onboarding/services/application-helpers.js`
- Move: `src/lib/onboarding/pipeline.js` → `src/domains/onboarding/services/pipeline.js`
- Move: `src/lib/onboarding/pool-status.js` → `src/domains/onboarding/services/pool-status.js`
- Move: `src/lib/onboarding/essentials-check.js` + `src/lib/onboarding/validation.js` → `src/domains/onboarding/validation/onboarding.schemas.js`
- Move: `src/lib/onboarding/providers/google.js` → `src/domains/onboarding/services/providers/google.js`
- Move: `src/lib/onboarding/providers/instagram.js` → `src/domains/onboarding/services/providers/instagram.js`
- Move: `src/lib/analytics/onboarding-events.js` → `src/domains/onboarding/analytics/onboarding-events.js`

- [ ] **Step 1: Move service files**

```bash
mv src/lib/onboarding/casting-machine.js src/domains/onboarding/services/state-machine.js
mv src/lib/onboarding/referral.js src/domains/onboarding/services/
mv src/lib/onboarding/signal-collector.js src/domains/onboarding/services/
mv src/lib/onboarding/auth-helpers.js src/domains/onboarding/services/
mv src/lib/onboarding/application-helpers.js src/domains/onboarding/services/
mv src/lib/onboarding/pipeline.js src/domains/onboarding/services/
mv src/lib/onboarding/pool-status.js src/domains/onboarding/services/
mv src/lib/onboarding/providers/google.js src/domains/onboarding/services/providers/
mv src/lib/onboarding/providers/instagram.js src/domains/onboarding/services/providers/
```

- [ ] **Step 2: Merge validation files**

Read `src/lib/onboarding/validation.js` and `src/lib/onboarding/essentials-check.js`. Combine into `src/domains/onboarding/validation/onboarding.schemas.js`.

- [ ] **Step 3: Move route + analytics files**

```bash
mv src/routes/onboarding.js src/domains/onboarding/routes/casting.js
mv src/routes/apply_essentials.js src/domains/onboarding/routes/apply-essentials.js
mv src/lib/analytics/onboarding-events.js src/domains/onboarding/analytics/
```

- [ ] **Step 4: Clean up old directories**

```bash
rm -rf src/lib/onboarding/
rm -rf src/lib/analytics/
```

- [ ] **Step 5: Update all imports**

```bash
grep -rn "require.*routes/onboarding\|require.*lib/onboarding\|require.*routes/apply_essentials\|require.*analytics/onboarding" src/ --include="*.js"
```

- [ ] **Step 6: Update app.js mounts**

```javascript
// OLD:
const onboardingRoutes = require('./routes/onboarding');
// NEW:
const onboardingRoutes = require('./domains/onboarding/routes/casting');
```

- [ ] **Step 7: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: move onboarding system to src/domains/onboarding/"
```

---

### Task 2.7: Move Talent domain

**Files:**
- Move: `src/routes/talent/*.api.js` → `src/domains/talent/routes/*.js` (drop .api suffix)
- Move: `src/routes/talent/index.js` → `src/domains/talent/routes/index.js`
- Move: `src/lib/profile-helpers.js` → `src/domains/talent/services/profile-helpers.js`
- Move: `src/lib/shared/profile-strength.cjs` → `src/domains/talent/services/profile-strength.js`
- Move: `src/lib/profile-completeness.js` → `src/domains/talent/services/profile-completeness.js`
- Move: `src/lib/profile-status.js` → `src/domains/talent/services/profile-status.js`
- Move: `src/lib/dashboard/completeness.js` → `src/domains/talent/services/completeness.js`
- Move: `src/lib/stats.js` → `src/domains/talent/services/stats.js`

- [ ] **Step 1: Move route files**

```bash
mv src/routes/talent/profile.api.js src/domains/talent/routes/profile.js
mv src/routes/talent/media.api.js src/domains/talent/routes/media.js
mv src/routes/talent/analytics.api.js src/domains/talent/routes/analytics.js
mv src/routes/talent/applications.api.js src/domains/talent/routes/applications.js
mv src/routes/talent/settings.api.js src/domains/talent/routes/settings.js
mv src/routes/talent/bio.api.js src/domains/talent/routes/bio.js
mv src/routes/talent/pdf.api.js src/domains/talent/routes/pdf-custom.js
mv src/routes/talent/dashboard.api.js src/domains/talent/routes/dashboard.js
mv src/routes/talent/agencies.api.js src/domains/talent/routes/agencies.js
mv src/routes/talent/index.js src/domains/talent/routes/index.js
```

- [ ] **Step 2: Move service files**

```bash
mv src/lib/profile-helpers.js src/domains/talent/services/
mv src/lib/shared/profile-strength.cjs src/domains/talent/services/profile-strength.js
mv src/lib/profile-completeness.js src/domains/talent/services/
mv src/lib/profile-status.js src/domains/talent/services/
mv src/lib/dashboard/completeness.js src/domains/talent/services/completeness.js
mv src/lib/stats.js src/domains/talent/services/stats.js
```

- [ ] **Step 3: Clean up old directories**

```bash
rm -rf src/routes/talent/
rm -rf src/lib/shared/
rm -rf src/lib/dashboard/
```

- [ ] **Step 4: Update all imports**

```bash
grep -rn "require.*routes/talent/\|require.*lib/profile-helpers\|require.*lib/profile-completeness\|require.*lib/profile-status\|require.*shared/profile-strength\|require.*lib/stats\|require.*dashboard/completeness" src/ --include="*.js"
```

Update the `index.js` inside `src/domains/talent/routes/index.js` to require the new relative paths for sub-routes.

- [ ] **Step 5: Update app.js**

```javascript
// OLD:
const dashboardTalentRoutes = require('./routes/talent/index');
// NEW:
const dashboardTalentRoutes = require('./domains/talent/routes/index');
```

- [ ] **Step 6: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: move talent system to src/domains/talent/"
```

---

### Task 2.8: Move Agency domain

The biggest move — `routes/api/agency.js` is 5,297 lines. For now, move it as-is. Decomposition happens in Phase 4.

**Files:**
- Move: `src/routes/agency.js` → `src/domains/agency/routes/roster.js`
- Move: `src/routes/api/agency.js` → `src/domains/agency/routes/inbox.js` (5,297 lines — split in Phase 4)
- Move: `src/routes/api/agency-overview.js` → `src/domains/agency/routes/overview.js`
- Move: `src/routes/api/public.js` → `src/domains/agency/routes/public.js`
- Move: `src/routes/scout.js` → `src/domains/agency/routes/discover.js`
- Move: `src/lib/agency-overview-queries.js` → `src/domains/agency/queries/overview.queries.js`
- Move: `src/lib/match-scoring.js` → `src/domains/agency/services/match-scoring.js`
- Move: `src/lib/agency-provisioning.js` → `src/domains/agency/services/provisioning.js`
- Move: `src/lib/agency-context.js` → `src/domains/agency/services/context.js`
- Delete: `src/routes/api.js` (mount file — mounts absorbed into app.js)
- Delete: `src/routes/api/` (directory emptied after moves)

- [ ] **Step 1: Move route files**

```bash
mv src/routes/agency.js src/domains/agency/routes/roster.js
mv src/routes/api/agency.js src/domains/agency/routes/inbox.js
mv src/routes/api/agency-overview.js src/domains/agency/routes/overview.js
mv src/routes/api/public.js src/domains/agency/routes/public.js
mv src/routes/scout.js src/domains/agency/routes/discover.js
```

- [ ] **Step 2: Move service + query files**

```bash
mv src/lib/agency-overview-queries.js src/domains/agency/queries/overview.queries.js
mv src/lib/match-scoring.js src/domains/agency/services/match-scoring.js
mv src/lib/agency-provisioning.js src/domains/agency/services/provisioning.js
mv src/lib/agency-context.js src/domains/agency/services/context.js
```

- [ ] **Step 3: Create agency routes index.js**

Create `src/domains/agency/routes/index.js`:
```javascript
const express = require('express');
const router = express.Router();

router.use(require('./roster'));
router.use(require('./inbox'));
router.use(require('./overview'));
router.use(require('./discover'));
router.use(require('./public'));

module.exports = router;
```

- [ ] **Step 4: Delete old mount file and directory**

```bash
rm src/routes/api.js
rm -rf src/routes/api/
```

- [ ] **Step 5: Update app.js — replace old mounts with domain mounts**

```javascript
// DELETE these old requires + mounts:
const agencyApiRoutes = require('./routes/api/agency');
const agencyOverviewRoutes = require('./routes/api/agency-overview');
const apiRoutes = require('./routes/api');
const publicRoutes = require('./routes/api/public');
const scoutRoutes = require('./routes/scout');
const agencyRoutes = require('./routes/agency');

// ADD new domain requires:
const agencyDomainRoutes = require('./domains/agency/routes/index');

// In the mount section, replace all agency-related mounts with:
app.use('/', agencyDomainRoutes);
```

Note: Carefully preserve the mount ORDER — agency API routes must come before the SPA catch-all.

- [ ] **Step 6: Update all imports in moved files**

```bash
grep -rn "require.*lib/agency-overview-queries\|require.*lib/match-scoring\|require.*lib/agency-provisioning\|require.*lib/agency-context" src/ --include="*.js"
```

- [ ] **Step 7: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: move agency system to src/domains/agency/"
```

---

### Task 2.9: Split validation.js into domain schemas

**Files:**
- Read: `src/lib/validation.js` (784 lines)
- Create: `src/domains/talent/validation/talent.schemas.js`
- Create: `src/domains/agency/validation/agency.schemas.js`
- Keep shared schemas in: `src/shared/lib/schemas.js` (already moved)
- Delete: `src/lib/validation.js`

- [ ] **Step 1: Read validation.js and categorize schemas**

Read `src/lib/validation.js`. Identify which Zod schemas belong to:
- Talent (profile, media, measurements, settings)
- Agency (application review, tag management, board management)
- Shared (date formats, common validators)

- [ ] **Step 2: Create domain schema files**

Split schemas into the domain files. Each file exports only its domain's schemas. Shared utility validators go in `src/shared/lib/schemas.js`.

- [ ] **Step 3: Update all importers**

```bash
grep -rn "require.*lib/validation" src/ --include="*.js"
```

Each importer should now require from its own domain's schemas file.

- [ ] **Step 4: Delete original**

```bash
rm src/lib/validation.js
```

- [ ] **Step 5: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: split validation.js into domain-specific schema files"
```

---

### Task 2.10: Clean up emptied old directories + update test imports

- [ ] **Step 1: Remove empty old directories**

```bash
rmdir src/middleware 2>/dev/null || true
rmdir src/lib 2>/dev/null || true
rmdir src/routes 2>/dev/null || true
# Note: src/routes/ may still have portfolio.js, pro.js, stripe.js, etc.
# Only rmdir if truly empty
```

- [ ] **Step 2: Update test imports**

```bash
grep -rn "require\|from " tests/ --include="*.js" --include="*.test.js"
```

Update any test files that import from old paths.

- [ ] **Step 3: Verify everything**

```bash
npm test && npm run dev:all
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: clean up empty directories and update test imports"
```

---

## Phase 3: Frontend Restructure

### Task 3.1: Create frontend directory skeleton

- [ ] **Step 1: Create all domain directories**

```bash
mkdir -p client/src/domains/talent/{pages,components/RightSidebar,hooks,api}
mkdir -p client/src/domains/agency/{pages,components/nav,components/ui,hooks,api}
mkdir -p client/src/domains/auth/{pages/LoginPage,components,hooks}
mkdir -p client/src/domains/onboarding/{pages,components,styles,hooks}
mkdir -p client/src/shared/{components/ui/forms,components/Header,layouts,styles,hooks,lib,utils}
```

- [ ] **Step 2: Commit**

```bash
find client/src/domains client/src/shared -type d -empty -exec touch {}/.gitkeep \;
git add client/src/domains/ client/src/shared/
git commit -m "chore: create frontend domain directory skeleton"
```

---

### Task 3.2: Move shared frontend (components, layouts, styles, hooks, utils, lib)

Move all truly shared/cross-domain files first.

**Files:** See spec Section "Frontend Structure → shared/" for complete list.

- [ ] **Step 1: Move shared components**

```bash
# UI forms
mv client/src/components/ui/forms/*.jsx client/src/shared/components/ui/forms/
mv client/src/components/ui/forms/*.css client/src/shared/components/ui/forms/ 2>/dev/null
mv client/src/components/ui/forms/index.js client/src/shared/components/ui/forms/
mv client/src/components/ui/ConfirmationDialog.jsx client/src/shared/components/ui/
mv client/src/components/ui/GradientText.jsx client/src/shared/components/ui/
mv client/src/components/ui/GradientText.css client/src/shared/components/ui/ 2>/dev/null
mv client/src/components/ui/index.jsx client/src/shared/components/ui/

# Header
mv client/src/components/Header/Header.jsx client/src/shared/components/Header/
mv client/src/components/Header/Header.css client/src/shared/components/Header/ 2>/dev/null
mv client/src/components/Header/NotificationDropdown.jsx client/src/shared/components/Header/

# Standalone shared (JSX + CSS companions)
mv client/src/components/ErrorBoundary.jsx client/src/shared/components/
mv client/src/components/Breadcrumbs.jsx client/src/shared/components/
mv client/src/components/CosmicBackground.jsx client/src/shared/components/
mv client/src/components/CosmicBackground.css client/src/shared/components/ 2>/dev/null
mv client/src/components/Card/Card.jsx client/src/shared/components/Card.jsx
mv client/src/components/Card/Card.css client/src/shared/components/Card.css 2>/dev/null
mv client/src/components/StatCard/StatCard.jsx client/src/shared/components/StatCard.jsx
mv client/src/components/StatCard/StatCard.css client/src/shared/components/StatCard.css 2>/dev/null
mv client/src/components/shared/EmptyState.jsx client/src/shared/components/EmptyState.jsx
mv client/src/components/shared/LoadingSpinner.jsx client/src/shared/components/LoadingSpinner.jsx
mv client/src/components/shared/StatCard.jsx client/src/shared/components/SharedStatCard.jsx
mv client/src/components/loaders/SkeletonOverview.jsx client/src/shared/components/SkeletonOverview.jsx
```

- [ ] **Step 2: Move layouts**

```bash
mv client/src/layouts/AgencyLayout.jsx client/src/shared/layouts/
mv client/src/layouts/AgencyLayout.css client/src/shared/layouts/
mv client/src/layouts/DashboardLayoutShell.jsx client/src/shared/layouts/
mv client/src/layouts/AuthLayout.jsx client/src/shared/layouts/
mv client/src/styles/dashboard-shell.css client/src/shared/layouts/DashboardLayoutShell.css
```

- [ ] **Step 3: Move styles**

```bash
mv client/src/styles/agency-tokens.css client/src/shared/styles/tokens.css
mv client/src/styles/variables.css client/src/shared/styles/  # merge into tokens.css later
mv client/src/styles/global.css client/src/shared/styles/
mv client/src/styles/utilities.css client/src/shared/styles/
mv client/src/styles/agency-dark-overrides.css client/src/shared/styles/dark-overrides.css
mv client/src/styles/dashboard.css client/src/shared/styles/
mv client/src/styles/reset.css client/src/shared/styles/
mv client/src/styles/ui.css client/src/shared/styles/
```

- [ ] **Step 4: Move shared hooks**

```bash
mv client/src/hooks/useKeyboardShortcuts.js client/src/shared/hooks/
mv client/src/hooks/useTypeToFocus.js client/src/shared/hooks/
mv client/src/hooks/useFlash.jsx client/src/shared/hooks/
```

- [ ] **Step 5: Move lib and utils**

```bash
mv client/src/lib/firebase.js client/src/shared/lib/
mv client/src/lib/validation.js client/src/shared/lib/
mv client/src/utils/*.js client/src/shared/utils/
```

- [ ] **Step 6: Update ALL imports across the entire frontend**

This is the bulk of the work. Use grep to find every import:

```bash
grep -rn "from.*\.\./components/ui\|from.*\.\./components/Header\|from.*\.\./components/ErrorBoundary\|from.*\.\./layouts/\|from.*\.\./styles/\|from.*\.\./hooks/useKeyboard\|from.*\.\./hooks/useFlash\|from.*\.\./hooks/useTypeToFocus\|from.*\.\./lib/\|from.*\.\./utils/" client/src/ --include="*.jsx" --include="*.js"
```

Update each to the new `shared/` path.

- [ ] **Step 7: Verify frontend builds**

```bash
cd client && npm run build && cd ..
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move shared frontend to client/src/shared/"
```

---

### Task 3.3: Move Auth domain (frontend)

**Files:**
- Move: `client/src/routes/auth/LoginPage.jsx` → `client/src/domains/auth/pages/LoginPage/index.jsx`
- Move: `client/src/components/auth/TalentSpotlight.jsx` → `client/src/domains/auth/components/TalentSpotlight.jsx`
- Move: `client/src/hooks/useAuth.js` → `client/src/domains/auth/hooks/useAuth.js`

- [ ] **Step 1: Move files**

```bash
mv client/src/routes/auth/LoginPage.jsx client/src/domains/auth/pages/LoginPage/index.jsx
mv client/src/components/auth/TalentSpotlight.jsx client/src/domains/auth/components/
mv client/src/hooks/useAuth.js client/src/domains/auth/hooks/
```

- [ ] **Step 2: Update imports (useAuth is imported widely)**

```bash
grep -rn "from.*hooks/useAuth\|from.*routes/auth/LoginPage\|from.*components/auth/TalentSpotlight" client/src/ --include="*.jsx" --include="*.js"
```

- [ ] **Step 3: Update App.jsx import**

```javascript
// OLD:
import LoginPage from './routes/auth/LoginPage';
// NEW:
import LoginPage from './domains/auth/pages/LoginPage';
```

- [ ] **Step 4: Verify + commit**

```bash
cd client && npm run build && cd ..
git add -A
git commit -m "refactor: move auth to client/src/domains/auth/"
```

---

### Task 3.4: Move Onboarding domain (frontend)

**Files:** All `routes/onboarding/*` pages, casting components, onboarding CSS, useCasting hook. See spec for complete list.

- [ ] **Step 1: Create page directories and move pages**

```bash
for page in CastingEntry CastingScout CastingMeasurements CastingGender CastingProfile CastingRevealPreview CastingRevealRadar CastingReview CastingCallPage TestPreview; do
  mkdir -p "client/src/domains/onboarding/pages/$page"
  mv "client/src/routes/onboarding/$page.jsx" "client/src/domains/onboarding/pages/$page/index.jsx" 2>/dev/null
done
```

- [ ] **Step 2: Move shared onboarding components**

```bash
mv client/src/routes/onboarding/CinematicDivider.jsx client/src/domains/onboarding/components/
mv client/src/routes/onboarding/CinematicNextButton.jsx client/src/domains/onboarding/components/
mv client/src/routes/onboarding/ThinkingText.jsx client/src/domains/onboarding/components/
mv client/src/routes/onboarding/animations.js client/src/domains/onboarding/components/
mv client/src/components/casting/ProgressIndicator.jsx client/src/domains/onboarding/components/
mv client/src/components/casting/ProgressIndicator.css client/src/domains/onboarding/components/ 2>/dev/null
mv client/src/components/casting/RadarChart.jsx client/src/domains/onboarding/components/
```

- [ ] **Step 3: Move onboarding styles and hook**

```bash
mv client/src/routes/onboarding/CastingCinematic.css client/src/domains/onboarding/styles/
mv client/src/routes/onboarding/CastingCall.css client/src/domains/onboarding/styles/
mv client/src/hooks/useCasting.js client/src/domains/onboarding/hooks/
```

- [ ] **Step 4: Update imports + App.jsx**

```bash
grep -rn "from.*routes/onboarding\|from.*hooks/useCasting\|from.*components/casting" client/src/ --include="*.jsx" --include="*.js"
```

- [ ] **Step 5: Clean up old directories**

```bash
rm -rf client/src/routes/onboarding/
rm -rf client/src/components/casting/
```

- [ ] **Step 6: Verify + commit**

```bash
cd client && npm run build && cd ..
git add -A
git commit -m "refactor: move onboarding to client/src/domains/onboarding/"
```

---

### Task 3.5: Move Talent domain (frontend)

**Files:** All talent pages, features/*, talent-specific components, talent hooks, talent API. See spec for complete list.

- [ ] **Step 1: Create talent page directories and move pages**

```bash
for page in ProfilePage OverviewPage MediaPage ApplicationsPage SettingsPage AnalyticsPage RevealPage DashboardPage; do
  mkdir -p "client/src/domains/talent/pages/$page"
done

mv client/src/routes/talent/ProfilePage.jsx client/src/domains/talent/pages/ProfilePage/index.jsx
mv client/src/routes/talent/ProfilePage.module.css client/src/domains/talent/pages/ProfilePage/
mv client/src/routes/talent/OverviewPage.jsx client/src/domains/talent/pages/OverviewPage/index.jsx
mv client/src/routes/talent/OverviewPage.css client/src/domains/talent/pages/OverviewPage/ 2>/dev/null
mv client/src/routes/talent/MediaPage.jsx client/src/domains/talent/pages/MediaPage/index.jsx
mv client/src/routes/talent/ApplicationsPage.jsx client/src/domains/talent/pages/ApplicationsPage/index.jsx
mv client/src/routes/talent/AnalyticsPage.jsx client/src/domains/talent/pages/AnalyticsPage/index.jsx
mv client/src/routes/talent/RevealPage.jsx client/src/domains/talent/pages/RevealPage/index.jsx
mv client/src/routes/DashboardPage.jsx client/src/domains/talent/pages/DashboardPage/index.jsx
mv client/src/routes/SettingsPage.jsx client/src/domains/talent/pages/SettingsPage/index.jsx
```

- [ ] **Step 2: Move analytics feature components into talent AnalyticsPage**

```bash
mv client/src/features/analytics/AnalyticsView.jsx client/src/domains/talent/pages/AnalyticsPage/
mv client/src/features/analytics/components/*.jsx client/src/domains/talent/pages/AnalyticsPage/
mv client/src/styles/analytics.css client/src/domains/talent/pages/AnalyticsPage/AnalyticsPage.css
```

- [ ] **Step 3: Move features → talent components**

```bash
# Media (JSX + CSS companions)
for f in MediaGallery CompCardPreview ImageMetadataModal PhotoEditorModal ReadinessBar CurationGuidance; do
  mv "client/src/features/media/$f.jsx" client/src/domains/talent/components/
  mv "client/src/features/media/$f.css" client/src/domains/talent/components/ 2>/dev/null
  mv "client/src/features/media/$f.module.css" client/src/domains/talent/components/ 2>/dev/null
done

# Profile (JSX + CSS companions)
for f in ProfileForm ProfilePreview; do
  mv "client/src/features/profile/$f.jsx" client/src/domains/talent/components/
  mv "client/src/features/profile/$f.css" client/src/domains/talent/components/ 2>/dev/null
done

# Applications (JSX + CSS companions)
mv client/src/features/applications/ApplicationsView.jsx client/src/domains/talent/components/
mv client/src/features/applications/ApplicationsView.css client/src/domains/talent/components/ 2>/dev/null
mv client/src/features/applications/components/ApplicationsList.jsx client/src/domains/talent/components/
mv client/src/features/applications/components/ApplicationsList.css client/src/domains/talent/components/ 2>/dev/null
mv client/src/features/applications/components/AgenciesGrid.jsx client/src/domains/talent/components/
mv client/src/features/applications/components/AgenciesGrid.css client/src/domains/talent/components/ 2>/dev/null

# Dashboard (JSX + CSS companions)
mv client/src/features/dashboard/OverviewView.jsx client/src/domains/talent/components/
mv client/src/features/dashboard/OverviewView.css client/src/domains/talent/components/ 2>/dev/null
```

- [ ] **Step 4: Move profile/dashboard components**

```bash
# Profile components (JSX + CSS companions)
for f in ProfileStrengthSidebar Section SocialInput; do
  mv "client/src/components/profile/$f.jsx" client/src/domains/talent/components/
  mv "client/src/components/profile/$f.css" client/src/domains/talent/components/ 2>/dev/null
  mv "client/src/components/profile/$f.module.css" client/src/domains/talent/components/ 2>/dev/null
done
mv client/src/components/profile/sections/IdentitySection.jsx client/src/domains/talent/components/
mv client/src/components/profile/sections/RepresentationSection.jsx client/src/domains/talent/components/
mv client/src/components/profile/index.js client/src/domains/talent/components/ 2>/dev/null
mv client/src/components/talent/profile/PhotosTab.jsx client/src/domains/talent/components/
mv client/src/components/talent/profile/PhotosTab.css client/src/domains/talent/components/ 2>/dev/null
mv client/src/components/dashboard/ProfileNav.jsx client/src/domains/talent/components/

# Talent-only shared-looking components (JSX + CSS companions)
for dir in HeroCard PhotoGallery PortfolioSnapshot RecentActivity Recommendations AgencyEngagementHero; do
  mv "client/src/components/$dir/"*.jsx client/src/domains/talent/components/
  mv "client/src/components/$dir/"*.css client/src/domains/talent/components/ 2>/dev/null
done
mv client/src/components/PerformanceOverview/*.jsx client/src/domains/talent/components/
mv client/src/components/PerformanceOverview/*.css client/src/domains/talent/components/ 2>/dev/null

# RightSidebar (JSX + CSS companions)
mv client/src/components/RightSidebar/*.jsx client/src/domains/talent/components/RightSidebar/
mv client/src/components/RightSidebar/*.css client/src/domains/talent/components/RightSidebar/ 2>/dev/null
```

- [ ] **Step 5: Move talent hooks and API**

```bash
mv client/src/hooks/useProfile.js client/src/domains/talent/hooks/
mv client/src/hooks/useMedia.js client/src/domains/talent/hooks/
mv client/src/hooks/useAnalytics.js client/src/domains/talent/hooks/
mv client/src/hooks/useProfileStrength.js client/src/domains/talent/hooks/
mv client/src/hooks/useRecentPhotos.js client/src/domains/talent/hooks/
mv client/src/api/talent.js client/src/domains/talent/api/
```

- [ ] **Step 6: Update ALL talent imports + App.jsx**

```bash
grep -rn "from.*routes/talent\|from.*routes/DashboardPage\|from.*routes/SettingsPage\|from.*features/\|from.*components/profile\|from.*components/talent\|from.*components/dashboard\|from.*hooks/useProfile\|from.*hooks/useMedia\|from.*hooks/useAnalytics\|from.*hooks/useProfileStrength\|from.*hooks/useRecentPhotos\|from.*api/talent" client/src/ --include="*.jsx" --include="*.js"
```

- [ ] **Step 7: Clean up old directories**

```bash
rm -rf client/src/routes/talent/
rm -rf client/src/features/
rm -rf client/src/components/profile/
rm -rf client/src/components/talent/
rm -rf client/src/components/dashboard/
rm -rf client/src/components/HeroCard/
rm -rf client/src/components/PerformanceOverview/
rm -rf client/src/components/PhotoGallery/
rm -rf client/src/components/PortfolioSnapshot/
rm -rf client/src/components/RecentActivity/
rm -rf client/src/components/Recommendations/
rm -rf client/src/components/AgencyEngagementHero/
rm -rf client/src/components/RightSidebar/
```

- [ ] **Step 8: Verify + commit**

```bash
cd client && npm run build && cd ..
git add -A
git commit -m "refactor: move talent to client/src/domains/talent/"
```

---

### Task 3.6: Move Agency domain (frontend)

**Files:** All agency pages + CSS, all agency components + CSS, agency hooks, agency API. See spec for complete list.

- [ ] **Step 1: Create agency page directories and move pages + CSS**

```bash
for page in InboxPage OverviewPage RosterPage DiscoverPage CastingPage SettingsPage AnalyticsPage MessagesPage BoardsPage ActivityPage ApplicantsPage OnboardingPage; do
  mkdir -p "client/src/domains/agency/pages/$page"
  mv "client/src/routes/agency/${page}.jsx" "client/src/domains/agency/pages/$page/index.jsx" 2>/dev/null
  mv "client/src/routes/agency/${page}.css" "client/src/domains/agency/pages/$page/${page}.css" 2>/dev/null
done
```

- [ ] **Step 2: Move Grainient (it's a component, not a page)**

```bash
mv client/src/routes/agency/Grainient.jsx client/src/domains/agency/components/
mv client/src/routes/agency/Grainient.css client/src/domains/agency/components/ 2>/dev/null
```

- [ ] **Step 3: Move agency components (all JSX + CSS)**

```bash
# Move all agency component JSX files
for f in client/src/components/agency/*.jsx; do
  mv "$f" client/src/domains/agency/components/
done

# Move all agency component CSS files
for f in client/src/components/agency/*.css; do
  mv "$f" client/src/domains/agency/components/
done

# Nav subdirectory
mv client/src/components/agency/nav/*.jsx client/src/domains/agency/components/nav/
mv client/src/components/agency/nav/*.css client/src/domains/agency/components/nav/ 2>/dev/null

# UI subdirectory (JSX + CSS + index)
mv client/src/components/agency/ui/*.jsx client/src/domains/agency/components/ui/
mv client/src/components/agency/ui/*.css client/src/domains/agency/components/ui/ 2>/dev/null
mv client/src/components/agency/ui/*.module.css client/src/domains/agency/components/ui/ 2>/dev/null
mv client/src/components/agency/ui/index.js client/src/domains/agency/components/ui/
```

- [ ] **Step 4: Move agency hooks and API**

```bash
mv client/src/hooks/useStats.js client/src/domains/agency/hooks/
mv client/src/api/agency.js client/src/domains/agency/api/
```

- [ ] **Step 5: Update ALL agency imports + App.jsx**

```bash
grep -rn "from.*routes/agency\|from.*components/agency\|from.*hooks/useStats\|from.*api/agency" client/src/ --include="*.jsx" --include="*.js"
```

- [ ] **Step 6: Clean up old directories**

```bash
rm -rf client/src/routes/agency/
rm -rf client/src/components/agency/
```

- [ ] **Step 7: Verify + commit**

```bash
cd client && npm run build && cd ..
git add -A
git commit -m "refactor: move agency to client/src/domains/agency/"
```

---

### Task 3.7: CSS consolidation — merge token and base style files

- [ ] **Step 1: Merge variables.css into tokens.css**

Read `client/src/shared/styles/variables.css` and `client/src/shared/styles/tokens.css`. Combine into a single `tokens.css` — tokens.css is the primary, append any unique variables from variables.css. Delete variables.css.

```bash
rm client/src/shared/styles/variables.css
```

- [ ] **Step 2: Merge reset.css and ui.css into global.css**

Read `client/src/shared/styles/reset.css` and `client/src/shared/styles/ui.css`. Prepend reset rules to the top of `global.css`, append ui rules. Delete the source files.

```bash
rm client/src/shared/styles/reset.css
rm client/src/shared/styles/ui.css
```

- [ ] **Step 3: Update CSS imports in index.css or main.jsx**

Check `client/src/index.css` and `client/src/main.jsx` for `@import` or `import` statements referencing the old CSS file names/paths. Update to new paths.

```bash
grep -rn "variables.css\|reset.css\|ui.css\|agency-tokens.css\|agency-dark-overrides.css\|dashboard-shell.css" client/src/ --include="*.jsx" --include="*.js" --include="*.css"
```

- [ ] **Step 4: Verify styles render correctly**

```bash
cd client && npm run build && cd ..
npm run dev:all
# Visually check: agency tokens (gold color), dark mode, reset styles, UI components
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: consolidate CSS — merge tokens, reset, and ui stylesheets"
```

---

### Task 3.8: Clean up emptied old frontend directories

- [ ] **Step 1: Remove empty directories**

```bash
rm -rf client/src/routes/ 2>/dev/null
rm -rf client/src/components/ 2>/dev/null
rm -rf client/src/hooks/ 2>/dev/null
rm -rf client/src/layouts/ 2>/dev/null
rm -rf client/src/styles/ 2>/dev/null
rm -rf client/src/lib/ 2>/dev/null
rm -rf client/src/utils/ 2>/dev/null
```

Note: Only remove if truly empty. If any files remain, investigate before deleting.

- [ ] **Step 2: Verify full app works**

```bash
cd client && npm run build && cd ..
npm run dev:all
# Click through: login, onboarding, talent dashboard (all pages), agency dashboard (all pages)
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove emptied old frontend directories"
```

---

## Phase 4: Megafile Decomposition

### Task 4.1: Split routes/api/agency.js (5,297 lines → 6 route files)

This is now at `src/domains/agency/routes/inbox.js` after Phase 2.

- [ ] **Step 1: Read the file and categorize endpoints**

Read `src/domains/agency/routes/inbox.js`. Categorize every route handler into:
- **inbox.js** — application listing, filtering, status changes, kanban
- **casting.js** — casting call CRUD, matching, publishing
- **tags.js** — tag CRUD, bulk tagging, tag removal
- **interviews.js** — interview scheduling, CRUD
- **reminders.js** — reminder CRUD, due date management
- **messages.js** — message threads, sending, reading

- [ ] **Step 2: Extract casting routes**

Create `src/domains/agency/routes/casting.js` with all casting-related handlers. Import shared dependencies.

- [ ] **Step 3: Extract tag routes**

Create `src/domains/agency/routes/tags.js`.

- [ ] **Step 4: Extract interview routes**

Create `src/domains/agency/routes/interviews.js`.

- [ ] **Step 5: Extract reminder routes**

Create `src/domains/agency/routes/reminders.js`.

- [ ] **Step 6: Extract message routes**

Create `src/domains/agency/routes/messages.js`.

- [ ] **Step 7: Update agency routes index.js to mount all new files**

- [ ] **Step 8: Verify + commit**

```bash
npm test && npm run dev:all
git add -A
git commit -m "refactor: split agency inbox.js (5,297 lines) into 6 focused route files"
```

---

### Task 4.2: Decompose ProfilePage.jsx (1,397 lines)

Now at `client/src/domains/talent/pages/ProfilePage/index.jsx`.

- [ ] **Step 1: Read the file and identify extractable sections**

Look for logical sections: identity fields, measurements form, photos tab, social links. Each section should be a self-contained component receiving props from the parent.

- [ ] **Step 2: Extract IdentitySection**

Create `IdentitySection.jsx` (~200 lines) in the same directory. Move identity-related JSX + state.

- [ ] **Step 3: Extract MeasurementsSection**

Create `MeasurementsSection.jsx` (~250 lines).

- [ ] **Step 4: Extract PhotosSection**

Create `PhotosSection.jsx` (~200 lines). Merge with existing `PhotosTab.jsx` if overlapping.

- [ ] **Step 5: Extract SocialSection**

Create `SocialSection.jsx` (~150 lines).

- [ ] **Step 6: Slim down index.jsx to shell (~150 lines)**

The shell imports sections, manages tab state, handles top-level data fetching.

- [ ] **Step 7: Verify profile page works (all tabs)**

```bash
cd client && npm run build && cd ..
npm run dev:all
# Visit /dashboard/talent/profile — click every tab
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: decompose ProfilePage (1,397 lines) into section components"
```

---

### Task 4.3: Decompose CastingPage.jsx (1,040 lines)

Now at `client/src/domains/agency/pages/CastingPage/index.jsx`.

- [ ] **Step 1: Read and identify sections**
- [ ] **Step 2: Extract CastingCallBuilder**
- [ ] **Step 3: Extract CastingMatchList**
- [ ] **Step 4: Extract CastingRequirements**
- [ ] **Step 5: Slim index.jsx to shell**
- [ ] **Step 6: Verify + commit**

```bash
git add -A
git commit -m "refactor: decompose CastingPage (1,040 lines) into section components"
```

---

### Task 4.4: Decompose OverviewPage.jsx (833 lines)

Now at `client/src/domains/agency/pages/OverviewPage/index.jsx`.

- [ ] **Step 1: Read and identify sections**
- [ ] **Step 2: Extract KpiCards**
- [ ] **Step 3: Extract RecentActivity**
- [ ] **Step 4: Extract PipelineChart**
- [ ] **Step 5: Slim index.jsx to shell**
- [ ] **Step 6: Verify + commit**

```bash
git add -A
git commit -m "refactor: decompose OverviewPage (833 lines) into section components"
```

---

### Task 4.5: Decompose SettingsPage.jsx (691 lines)

Now at `client/src/domains/agency/pages/SettingsPage/index.jsx`.

- [ ] **Step 1: Read and identify sections**
- [ ] **Step 2: Extract BrandingSection**
- [ ] **Step 3: Extract TeamSection**
- [ ] **Step 4: Extract OnboardingSection**
- [ ] **Step 5: Slim index.jsx to shell**
- [ ] **Step 6: Verify + commit**

```bash
git add -A
git commit -m "refactor: decompose SettingsPage (691 lines) into section components"
```

---

### Task 4.6: Decompose OnboardingPage.jsx (643 lines)

Now at `client/src/domains/agency/pages/OnboardingPage/index.jsx`.

- [ ] **Step 1: Read and identify sections**
- [ ] **Step 2: Extract OnboardingSteps**
- [ ] **Step 3: Slim index.jsx to shell**
- [ ] **Step 4: Verify + commit**

```bash
git add -A
git commit -m "refactor: decompose OnboardingPage (643 lines) into section components"
```

---

## Phase 5: Cleanup & Documentation

### Task 5.1: Remove .gitkeep files and empty dirs

- [ ] **Step 1: Find and remove .gitkeep files**

```bash
find src/domains src/shared client/src/domains client/src/shared -name ".gitkeep" -delete
```

- [ ] **Step 2: Remove any remaining empty directories**

```bash
find src/ client/src/ -type d -empty -delete 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove .gitkeep files and empty directories"
```

---

### Task 5.2: Grep for dead imports and unused exports

- [ ] **Step 1: Check for imports from old paths**

```bash
grep -rn "from.*\./routes/\|from.*\./components/\|from.*\./features/\|from.*\./hooks/\|from.*\./layouts/\|from.*\./styles/" client/src/App.jsx client/src/domains/ client/src/shared/ --include="*.jsx" --include="*.js"

grep -rn "require.*\./routes/[^/]\|require.*\./middleware/[^/]\|require.*\./lib/[^s]" src/app.js src/domains/ src/shared/ --include="*.js"
```

Expected: zero results. If any found, fix them.

- [ ] **Step 2: Commit if changes needed**

```bash
git add -A
git commit -m "fix: resolve remaining dead imports from old paths"
```

---

### Task 5.3: Update CLAUDE.md

- [ ] **Step 1: Read current CLAUDE.md**
- [ ] **Step 2: Update the "Backend Structure" and "Frontend Structure" sections**

Replace the old flat structure documentation with the new domain-first structure. Update:
- Route organization section
- Key middleware section (new paths)
- Component organization section (new domain paths)
- Any file path references throughout

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect domain-first codebase structure"
```

---

### Task 5.4: Final full verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

- [ ] **Step 2: Build frontend**

```bash
cd client && npm run build && cd ..
```

- [ ] **Step 3: Boot app and click through all routes**

```bash
npm run dev:all
```

Verify:
- [ ] Login page loads
- [ ] Onboarding flow works (all steps)
- [ ] Talent dashboard: overview, profile (all tabs), media, analytics, applications, settings
- [ ] Agency dashboard: inbox, overview, roster, discover, casting, boards, messages, activity, analytics, settings
- [ ] PDF generation works
- [ ] Logout works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: codebase reorganization complete — domain-first vertical slices"
```
