# Contextual Readiness Narratives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one industry-accurate readiness sentence per talent (top gap + optional top-3), template-first with optional Groq polish, wired into Overview and ProfileStrengthSidebar.

**Architecture:** `readiness-narrative/` service modules mirror bio-writer; gap priority integrates Package Intelligence; cache on `profiles.readiness_narrative_cache`; `GET /api/talent/readiness/narrative`.

**Tech Stack:** Node 20, Groq `llama-3.3-70b-versatile`, React Query, existing PI + profile-strength.

**Design spec:** `docs/superpowers/specs/2026-06-24-contextual-readiness-narratives-design.md`

---

## Task 1: Migration + constants

**Files:**
- Create: `migrations/20260625120000_add_readiness_narrative_cache.js`
- Create: `src/domains/talent/services/readiness-narrative/constants.js`

- [ ] **Step 1:** Migration adds nullable `readiness_narrative_cache` (text/jsonb) to `profiles`
- [ ] **Step 2:** Run `npm run migrate`
- [ ] **Step 3:** Constants: `NARRATIVE_MAX_WORDS=28`, `GROQ_DEBOUNCE_MS=60000`, `REFRESH_DEBOUNCE_MS=3000`

---

## Task 2: Gap priority + templates

**Files:**
- Create: `src/domains/talent/services/readiness-narrative/gap-priority.js`
- Create: `src/domains/talent/services/readiness-narrative/templates.js`
- Create: `tests/talent/readiness-narrative-gap-priority.test.js`
- Create: `tests/talent/readiness-narrative-templates.test.js`

- [ ] **Step 1:** Implement `selectRankedGaps({ profile, strength, packageIntel })` per spec §6
- [ ] **Step 2:** Implement `renderTemplate(key, facts)` with all keys from spec §8
- [ ] **Step 3:** Tests: stale beats improve; guardian first; dedup digitals_recency/stale_digitals
- [ ] **Step 4:** Run `npx jest tests/talent/readiness-narrative-gap-priority.test.js tests/talent/readiness-narrative-templates.test.js`

---

## Task 3: Context builder

**Files:**
- Create: `src/domains/talent/services/readiness-narrative/context-builder.js`
- Create: `tests/talent/readiness-narrative-context.test.js`

- [ ] **Step 1:** `buildReadinessContext(profile, images)` — strength + PI + ranked gaps + templateText
- [ ] **Step 2:** Map links from `profileReadinessItems` READINESS_KEY_TO_PROFILE_URL equivalents (server-side map)
- [ ] **Step 3:** Tests: PI facts (digitalsAgeDays) flow; no invented numbers

---

## Task 4: Validator + narrative writer (templates only)

**Files:**
- Create: `src/domains/talent/services/readiness-narrative/output-validator.js`
- Create: `src/domains/talent/services/readiness-narrative/narrative-writer.js`
- Create: `tests/talent/readiness-narrative-validator.test.js`

- [ ] **Step 1:** Validator: word count, banned phrases, number grounding
- [ ] **Step 2:** `generateNarratives(context, { limit })` returns `{ primary, items, source: 'template' }` without Groq
- [ ] **Step 3:** Run validator tests

---

## Task 5: Cache + hash

**Files:**
- Create: `src/domains/talent/services/readiness-narrative/cache.js`

- [ ] **Step 1:** `buildReadinessHash(profile, images, strength, packageIntel)` — stable stringify + sha256
- [ ] **Step 2:** `readCache(profile)`, `writeCache(knex, profileId, payload)`
- [ ] **Step 3:** `getOrGenerateNarrative(knex, profileId, { limit, useGroq })` orchestrates hash → cache → generate

---

## Task 6: Groq polish layer

**Files:**
- Modify: `src/domains/talent/services/readiness-narrative/narrative-writer.js`
- Modify: `src/config.js` (optional `readinessNarrative.groqEnabled` env)

- [ ] **Step 1:** Add `polishWithGroq(context)` using spec §9 prompts
- [ ] **Step 2:** Per-profile 60s debounce map
- [ ] **Step 3:** Feature flag `READINESS_NARRATIVE_GROQ` default true when key present
- [ ] **Step 4:** Fail soft → template on any error

---

## Task 7: API route

**Files:**
- Create: `src/domains/talent/routes/readiness-narrative.js`
- Modify: `src/domains/talent/routes/index.js`
- Create: `tests/talent/readiness-narrative-route.test.js`

- [ ] **Step 1:** `GET /readiness/narrative?limit=3` — requireRole TALENT
- [ ] **Step 2:** Load profile + images, call getOrGenerateNarrative
- [ ] **Step 3:** Integration test: 401, cache hit shape, template fallback when Groq mocked fail

---

## Task 8: Invalidation hooks

**Files:**
- Create: `src/domains/talent/services/readiness-narrative/schedule-refresh.js`
- Modify: `src/domains/talent/routes/media.js`
- Modify: `src/domains/talent/routes/profile.js`

- [ ] **Step 1:** `scheduleReadinessNarrativeRefresh(profileId)` — 3s debounce, fire-and-forget regenerate
- [ ] **Step 2:** Call after image upload/PATCH and profile PATCH affecting readiness

---

## Task 9: Client template mirror + API

**Files:**
- Create: `client/src/shared/utils/readinessNarrativeTemplates.js` (port templates for instant fallback)
- Modify: `client/src/domains/talent/api/talent.js`
- Create: `client/src/domains/talent/hooks/useReadinessNarrative.js`

- [ ] **Step 1:** Client `buildLocalNarrative(profile, images)` using PI + templates
- [ ] **Step 2:** `talentApi.getReadinessNarrative({ limit })`
- [ ] **Step 3:** Hook with staleTime 60s; invalidate on media/profile mutations

---

## Task 10: Overview UI

**Files:**
- Modify: `client/src/domains/talent/pages/OverviewPage/index.jsx`
- Modify: `client/src/domains/talent/pages/OverviewPage/OverviewPage.css`

- [ ] **Step 1:** `useReadinessNarrative()` + local fallback while loading
- [ ] **Step 2:** `.ov-readiness-narrative` above audit checklist — plain text, muted
- [ ] **Step 3:** Hide when package complete and no warnings

---

## Task 11: Sidebar UI

**Files:**
- Modify: `client/src/domains/talent/components/ProfileStrengthSidebar.jsx`
- Modify: `client/src/domains/talent/components/ProfileStrengthSidebar.module.css`

- [ ] **Step 1:** Lead narrative above gap list when gaps exist
- [ ] **Step 2:** In audit mode, use narrative `items[].text` for top 3 gaps when available

---

## Task 12: Verification

- [ ] **Step 1:** `npx jest tests/talent/readiness-narrative-*.test.js`
- [ ] **Step 2:** Manual: stale digitals profile shows age sentence on Overview
- [ ] **Step 3:** Manual: Groq disabled → template still renders
- [ ] **Step 4:** `cd client && npm run lint` on touched files

---

## Acceptance (from spec §18)

1. Stale digitals mentions days + 90-day norm  
2. `portfolio_as_digital` beats generic headshot gap  
3. Minor guardian consent first  
4. Groq failure → template, never empty  
5. Cache hit skips second Groq call within 60s  
6. Plain text UI — no banned patterns  

**Estimated effort:** 3–4 days
