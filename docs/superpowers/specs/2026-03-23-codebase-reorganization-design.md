# Codebase Reorganization: Domain-First Vertical Slices

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Full restructure of the Pholio app codebase (login, onboarding, talent dashboard, agency dashboard). No marketing site — that lives elsewhere.

## Context

The codebase grew organically during rapid iteration. Marketing site has been split out. What remains is purely the app: auth, onboarding, talent dashboard, agency dashboard. This is the right moment to reorganize for scalability, developer velocity, and maintainability.

## Goals

1. **Separate talent/agency domains** — clear ownership boundaries, no accidental cross-contamination
2. **Kill megafiles** — no component over ~300 lines; pages become directories with extracted sections
3. **Purge dead code** — backup files, stubs, legacy SSR routes, dead marketing assets
4. **Dev velocity** — a developer working on "agency inbox" should know exactly where to look in both backend and frontend

## Approach: Domain-First Vertical Slices

Organize by domain (talent, agency, auth, onboarding, pdf, ai) at every layer. Backend and frontend mirror each other. Each domain is self-contained with its own routes, services, queries, validation, components, hooks, and API client.

---

## Backend Structure

```
src/
├── domains/
│   ├── talent/
│   │   ├── routes/
│   │   │   ├── profile.js          ← routes/talent/profile.api.js (562 lines)
│   │   │   ├── media.js            ← routes/talent/media.api.js (372 lines)
│   │   │   ├── analytics.js        ← routes/talent/analytics.api.js (668 lines)
│   │   │   ├── applications.js     ← routes/talent/applications.api.js (146 lines)
│   │   │   ├── settings.js         ← routes/talent/settings.api.js (84 lines)
│   │   │   ├── bio.js              ← routes/talent/bio.api.js (91 lines)
│   │   │   ├── pdf-custom.js       ← routes/talent/pdf.api.js (79 lines)
│   │   │   ├── dashboard.js        ← routes/talent/dashboard.api.js (162 lines)
│   │   │   ├── agencies.js         ← routes/talent/agencies.api.js (78 lines)
│   │   │   └── index.js            ← routes/talent/index.js (38 lines, SPA catch-all + mounts)
│   │   ├── queries/
│   │   │   └── talent.queries.js    ← extracted from route handlers
│   │   ├── services/
│   │   │   ├── profile-helpers.js   ← lib/profile-helpers.js (173 lines)
│   │   │   ├── profile-strength.js  ← lib/shared/profile-strength.cjs (206 lines, rename .cjs → .js, safe: backend is all CommonJS)
│   │   │   ├── profile-completeness.js ← lib/profile-completeness.js (128 lines)
│   │   │   ├── profile-status.js    ← lib/profile-status.js (73 lines)
│   │   │   └── scoring.js          ← lib/stats.js (9 lines, merge into scoring)
│   │   └── validation/
│   │       └── talent.schemas.js    ← talent-specific schemas extracted from lib/validation.js (784 lines)
│   │
│   ├── agency/
│   │   ├── routes/
│   │   │   ├── roster.js           ← routes/agency.js (291 lines, roster endpoints)
│   │   │   ├── inbox.js            ← routes/api/agency.js (5,297 lines → MUST SPLIT, see Phase 2 notes)
│   │   │   ├── overview.js         ← routes/api/agency-overview.js (72 lines)
│   │   │   ├── discover.js         ← routes/scout.js (168 lines)
│   │   │   ├── casting.js          ← agency casting-call endpoints (extracted from inbox.js)
│   │   │   ├── tags.js             ← tag management endpoints (extracted from inbox.js)
│   │   │   ├── interviews.js       ← interview endpoints (extracted from inbox.js)
│   │   │   ├── reminders.js        ← reminder endpoints (extracted from inbox.js)
│   │   │   ├── messages.js         ← message endpoints (extracted from inbox.js)
│   │   │   ├── public.js           ← routes/api/public.js (226 lines)
│   │   │   └── index.js            ← new mount point (replaces routes/api.js for agency)
│   │   ├── queries/
│   │   │   ├── agency.queries.js    ← extracted from route handlers
│   │   │   └── overview.queries.js  ← lib/agency-overview-queries.js (474 lines)
│   │   ├── services/
│   │   │   ├── match-scoring.js     ← lib/match-scoring.js (418 lines)
│   │   │   ├── provisioning.js      ← lib/agency-provisioning.js (103 lines)
│   │   │   └── context.js           ← lib/agency-context.js (134 lines)
│   │   └── validation/
│   │       └── agency.schemas.js    ← agency-specific schemas extracted from lib/validation.js
│   │
│   ├── auth/
│   │   ├── routes/
│   │   │   └── auth.js             ← routes/auth.js (843 lines)
│   │   ├── middleware/
│   │   │   ├── require-auth.js      ← middleware/auth.js (187 lines)
│   │   │   ├── firebase-auth.js     ← middleware/firebase-auth.js (116 lines)
│   │   │   └── session-validator.js ← middleware/session-validator.js (158 lines)
│   │   └── services/
│   │       └── firebase-admin.js    ← lib/firebase-admin.js (184 lines)
│   │
│   ├── onboarding/
│   │   ├── routes/
│   │   │   ├── casting.js          ← routes/onboarding.js (1,357 lines → thin handler, logic to services)
│   │   │   └── apply-essentials.js  ← routes/apply_essentials.js (269 lines)
│   │   ├── services/
│   │   │   ├── state-machine.js     ← lib/onboarding/casting-machine.js (310 lines, the ONLY one)
│   │   │   ├── referral.js          ← lib/onboarding/referral.js (197 lines)
│   │   │   ├── signal-collector.js  ← lib/onboarding/signal-collector.js (112 lines)
│   │   │   ├── auth-helpers.js      ← lib/onboarding/auth-helpers.js (209 lines)
│   │   │   ├── application-helpers.js ← lib/onboarding/application-helpers.js (69 lines)
│   │   │   ├── pipeline.js          ← lib/onboarding/pipeline.js (22 lines)
│   │   │   ├── pool-status.js       ← lib/onboarding/pool-status.js (90 lines)
│   │   │   └── providers/
│   │   │       ├── google.js        ← lib/onboarding/providers/google.js (72 lines)
│   │   │       └── instagram.js     ← lib/onboarding/providers/instagram.js (57 lines)
│   │   ├── analytics/
│   │   │   └── onboarding-events.js ← lib/analytics/onboarding-events.js (77 lines)
│   │   └── validation/
│   │       └── onboarding.schemas.js ← lib/onboarding/validation.js (75 lines) + essentials-check.js (78 lines) merged
│   │
│   ├── pdf/
│   │   ├── routes/
│   │   │   └── pdf.js              ← routes/pdf.js (1,378 lines → thin handler, logic to services)
│   │   ├── generator.js            ← lib/pdf.js (365 lines)
│   │   ├── layouts.js              ← lib/pdf-layouts.js (265 lines)
│   │   ├── fonts.js                ← lib/fonts.js (247 lines)
│   │   ├── themes.js               ← lib/themes.js (452 lines) + lib/color-palettes.js (239 lines) merged
│   │   ├── comp-card-selector.js   ← lib/comp-card-selector.js (81 lines)
│   │   └── templates/
│   │       ├── compcard.ejs         ← views/pdf/compcard.ejs
│   │       └── compcard-standard.ejs ← views/pdf/compcard-standard.ejs
│   │
│   └── ai/
│       ├── groq-casting.js         ← lib/ai/groq-casting.js (329 lines)
│       ├── photo-analysis.js       ← lib/ai/photo-analysis.js (174 lines) + analyzeProfileImage.js (222 lines) + photo-analysis-interface.js (56 lines) merged
│       ├── embeddings.js           ← lib/ai/embeddings.js (203 lines)
│       ├── archetypes.js           ← lib/ai/archetypes.js (189 lines)
│       └── scoring.js              ← lib/ai/imageScoring.js (164 lines)
│
├── shared/
│   ├── middleware/
│   │   ├── error-handler.js        ← middleware/error-handler.js (489 lines)
│   │   ├── context.js              ← middleware/context.js (193 lines)
│   │   ├── onboarding-redirect.js  ← middleware/onboarding-redirect.js (68 lines)
│   │   └── require-profile-unlocked.js ← middleware/require-profile-unlocked.js (44 lines)
│   ├── lib/
│   │   ├── uploader.js             ← lib/uploader.js (198 lines)
│   │   ├── email.js                ← lib/email.js (141 lines)
│   │   ├── stripe.js               ← lib/stripe.js (172 lines)
│   │   ├── subscriptions.js        ← lib/subscriptions.js (164 lines)
│   │   ├── geolocation.js          ← lib/geolocation.js (106 lines)
│   │   ├── storage.js              ← lib/storage.js (60 lines)
│   │   ├── slugify.js              ← lib/slugify.js (30 lines)
│   │   ├── sanitize.js             ← lib/sanitize.js (10 lines)
│   │   ├── image-validator.js      ← lib/image-validator.js (76 lines)
│   │   ├── api-response.js         ← lib/api-response.js (86 lines)
│   │   ├── user-helpers.js         ← lib/user-helpers.js (145 lines)
│   │   ├── curate.js               ← lib/curate.js (26 lines)
│   │   └── schemas.js              ← lib/schemas.js (11 lines, shared base schemas)
│   └── db/
│       └── knex.js                 ← db/knex.js (4 lines)
│
├── app.js                          ← app.js (606 lines, updated mounts, removes routes/api.js indirection)
├── config.js                       ← config.js (92 lines; DELETE lib/config.js duplicate)
└── routes/                         ← cross-cutting, not domain-specific
    ├── portfolio.js                ← routes/portfolio.js (375 lines)
    ├── pro.js                      ← routes/pro.js (37 lines, premium tier)
    ├── stripe.js                   ← routes/stripe.js (184 lines)
    ├── stripe-webhook.js           ← routes/stripe-webhook.js (174 lines)
    ├── upload.js                   ← routes/upload.js (169 lines)
    └── chat.js                     ← routes/chat.js (1,105 lines)
```

**Key backend decisions:**

- `routes/api.js` (97 lines) — DELETED. Its mounts are absorbed into `app.js` directly pointing at domain index routes.
- `routes/api/agency.js` (5,297 lines) — the BIGGEST backend file. Split into ~6 domain route files (inbox, casting, tags, interviews, reminders, messages) during Phase 2.
- `lib/config.js` — DELETED (duplicate of `src/config.js`).
- `lib/dashboard/` directory — `completeness.js` → `talent/services/profile-completeness.js`; `shared-utils.js` and `template-helpers.js` → DELETED (legacy EJS helpers, only used by deleted dashboard-talent routes).
- `.cjs` → `.js` rename for `profile-strength.cjs` is safe because the entire backend uses CommonJS (`require()`).
- `lib/onboarding/providers/` directory preserved in `onboarding/services/providers/`.

---

## Frontend Structure

```
client/src/
├── domains/
│   ├── talent/
│   │   ├── pages/
│   │   │   ├── ProfilePage/
│   │   │   │   ├── index.jsx            ← routes/talent/ProfilePage.jsx (1,397 lines → shell ~150 lines)
│   │   │   │   ├── IdentitySection.jsx  ← extracted + components/profile/sections/IdentitySection.jsx
│   │   │   │   ├── MeasurementsSection.jsx ← extracted
│   │   │   │   ├── PhotosSection.jsx    ← extracted + components/talent/profile/PhotosTab.jsx
│   │   │   │   ├── SocialSection.jsx    ← extracted + components/profile/SocialInput.jsx
│   │   │   │   └── ProfilePage.module.css ← routes/talent/ProfilePage.module.css (1,207 lines)
│   │   │   ├── OverviewPage/
│   │   │   │   ├── index.jsx            ← routes/talent/OverviewPage.jsx
│   │   │   │   └── OverviewPage.css     ← routes/talent/OverviewPage.css
│   │   │   ├── MediaPage/
│   │   │   │   └── index.jsx            ← routes/talent/MediaPage.jsx
│   │   │   ├── ApplicationsPage/
│   │   │   │   └── index.jsx            ← routes/talent/ApplicationsPage.jsx
│   │   │   ├── SettingsPage/
│   │   │   │   └── index.jsx            ← routes/SettingsPage.jsx (395 lines, top-level talent settings)
│   │   │   ├── AnalyticsPage/
│   │   │   │   ├── index.jsx            ← routes/talent/AnalyticsPage.jsx + features/analytics/AnalyticsView.jsx (501 lines)
│   │   │   │   ├── CohortHeatmap.jsx    ← features/analytics/components/CohortHeatmap.jsx
│   │   │   │   ├── SessionsBarChart.jsx ← features/analytics/components/SessionsBarChart.jsx
│   │   │   │   ├── WeeklyBarChart.jsx   ← features/analytics/components/WeeklyBarChart.jsx
│   │   │   │   ├── SparklineChart.jsx   ← features/analytics/components/SparklineChart.jsx
│   │   │   │   ├── MetricCardDetailed.jsx ← features/analytics/components/MetricCardDetailed.jsx
│   │   │   │   ├── InsightCard.jsx      ← features/analytics/components/InsightCard.jsx
│   │   │   │   ├── LockedMetricCard.jsx ← features/analytics/components/LockedMetricCard.jsx
│   │   │   │   ├── MetricBreakdown.jsx  ← features/analytics/components/MetricBreakdown.jsx
│   │   │   │   ├── PremiumAnalyticsUnlock.jsx ← features/analytics/components/PremiumAnalyticsUnlock.jsx
│   │   │   │   └── AnalyticsPage.css    ← styles/analytics.css (1,719 lines)
│   │   │   ├── RevealPage/
│   │   │   │   └── index.jsx            ← routes/talent/RevealPage.jsx (196 lines)
│   │   │   └── DashboardPage/
│   │   │       └── index.jsx            ← routes/DashboardPage.jsx (top-level redirect/landing)
│   │   ├── components/
│   │   │   ├── ProfileForm.jsx          ← features/profile/ProfileForm.jsx (314 lines)
│   │   │   ├── ProfilePreview.jsx       ← features/profile/ProfilePreview.jsx
│   │   │   ├── ProfileStrengthSidebar.jsx ← components/profile/ProfileStrengthSidebar.jsx (224 lines)
│   │   │   ├── Section.jsx              ← components/profile/Section.jsx
│   │   │   ├── RepresentationSection.jsx ← components/profile/sections/RepresentationSection.jsx
│   │   │   ├── MediaGallery.jsx         ← features/media/MediaGallery.jsx (361 lines)
│   │   │   ├── CompCardPreview.jsx      ← features/media/CompCardPreview.jsx (262 lines)
│   │   │   ├── ImageMetadataModal.jsx   ← features/media/ImageMetadataModal.jsx (281 lines)
│   │   │   ├── PhotoEditorModal.jsx     ← features/media/PhotoEditorModal.jsx
│   │   │   ├── ReadinessBar.jsx         ← features/media/ReadinessBar.jsx
│   │   │   ├── CurationGuidance.jsx     ← features/media/CurationGuidance.jsx
│   │   │   ├── OverviewView.jsx         ← features/dashboard/OverviewView.jsx (330 lines)
│   │   │   ├── OverviewView.css         ← features/dashboard/OverviewView.css
│   │   │   ├── ApplicationsView.jsx     ← features/applications/ApplicationsView.jsx
│   │   │   ├── ApplicationsList.jsx     ← features/applications/components/ApplicationsList.jsx (248 lines)
│   │   │   ├── AgenciesGrid.jsx         ← features/applications/components/AgenciesGrid.jsx (208 lines)
│   │   │   ├── HeroCard.jsx             ← components/HeroCard/HeroCard.jsx
│   │   │   ├── PerformanceOverview.jsx  ← components/PerformanceOverview/PerformanceOverview.jsx
│   │   │   ├── PerformanceSummary.jsx   ← components/PerformanceOverview/PerformanceSummary.jsx
│   │   │   ├── PhotoGallery.jsx         ← components/PhotoGallery/PhotoGallery.jsx
│   │   │   ├── PortfolioSnapshot.jsx    ← components/PortfolioSnapshot/PortfolioSnapshot.jsx
│   │   │   ├── RecentActivity.jsx       ← components/RecentActivity/RecentActivity.jsx
│   │   │   ├── Recommendations.jsx      ← components/Recommendations/Recommendations.jsx
│   │   │   ├── AgencyEngagementHero.jsx ← components/AgencyEngagementHero/AgencyEngagementHero.jsx
│   │   │   ├── ProfileNav.jsx           ← components/dashboard/ProfileNav.jsx
│   │   │   └── RightSidebar/           ← components/RightSidebar/ (keep as subdirectory)
│   │   │       ├── RightSidebar.jsx
│   │   │       ├── SidebarProfile.jsx
│   │   │       ├── SidebarActions.jsx
│   │   │       ├── AgencyInterest.jsx
│   │   │       └── MomentumChart.jsx
│   │   ├── hooks/
│   │   │   ├── useProfile.js            ← hooks/useProfile.js
│   │   │   ├── useMedia.js              ← hooks/useMedia.js
│   │   │   ├── useAnalytics.js          ← hooks/useAnalytics.js
│   │   │   ├── useProfileStrength.js    ← hooks/useProfileStrength.js
│   │   │   └── useRecentPhotos.js       ← hooks/useRecentPhotos.js
│   │   └── api/
│   │       └── talent.js               ← api/talent.js
│   │
│   ├── agency/
│   │   ├── pages/
│   │   │   ├── InboxPage/
│   │   │   │   ├── index.jsx            ← routes/agency/InboxPage.jsx (198 lines)
│   │   │   │   ├── InboxFilters.jsx     ← extracted
│   │   │   │   ├── InboxKanban.jsx      ← extracted
│   │   │   │   ├── InboxList.jsx        ← extracted
│   │   │   │   └── InboxPage.css        ← routes/agency/InboxPage.css
│   │   │   ├── OverviewPage/
│   │   │   │   ├── index.jsx            ← routes/agency/OverviewPage.jsx (833 lines → split)
│   │   │   │   ├── KpiCards.jsx         ← extracted
│   │   │   │   ├── RecentActivity.jsx   ← extracted
│   │   │   │   ├── PipelineChart.jsx    ← extracted
│   │   │   │   └── OverviewPage.css     ← routes/agency/OverviewPage.css (1,806 lines)
│   │   │   ├── RosterPage/
│   │   │   │   ├── index.jsx            ← routes/agency/RosterPage.jsx (231 lines)
│   │   │   │   └── RosterPage.css       ← routes/agency/RosterPage.css
│   │   │   ├── DiscoverPage/
│   │   │   │   ├── index.jsx            ← routes/agency/DiscoverPage.jsx (506 lines)
│   │   │   │   └── DiscoverPage.css     ← routes/agency/DiscoverPage.css (949 lines)
│   │   │   ├── CastingPage/
│   │   │   │   ├── index.jsx            ← routes/agency/CastingPage.jsx (1,040 lines → split)
│   │   │   │   ├── CastingCallBuilder.jsx ← extracted
│   │   │   │   ├── CastingMatchList.jsx ← extracted
│   │   │   │   ├── CastingRequirements.jsx ← extracted
│   │   │   │   └── CastingPage.css      ← routes/agency/CastingPage.css (1,348 lines)
│   │   │   ├── SettingsPage/
│   │   │   │   ├── index.jsx            ← routes/agency/SettingsPage.jsx (691 lines → split)
│   │   │   │   ├── BrandingSection.jsx  ← extracted
│   │   │   │   ├── TeamSection.jsx      ← extracted
│   │   │   │   ├── OnboardingSection.jsx ← extracted
│   │   │   │   └── SettingsPage.css     ← routes/agency/SettingsPage.css (731 lines)
│   │   │   ├── AnalyticsPage/
│   │   │   │   ├── index.jsx            ← routes/agency/AnalyticsPage.jsx (403 lines)
│   │   │   │   └── AnalyticsPage.css    ← routes/agency/AnalyticsPage.css (272 lines)
│   │   │   ├── MessagesPage/
│   │   │   │   ├── index.jsx            ← routes/agency/MessagesPage.jsx (283 lines)
│   │   │   │   └── MessagesPage.css     ← routes/agency/MessagesPage.css (474 lines)
│   │   │   ├── BoardsPage/
│   │   │   │   ├── index.jsx            ← routes/agency/BoardsPage.jsx (286 lines)
│   │   │   │   └── BoardsPage.css       ← routes/agency/BoardsPage.css (422 lines)
│   │   │   ├── ActivityPage/
│   │   │   │   ├── index.jsx            ← routes/agency/ActivityPage.jsx
│   │   │   │   └── ActivityPage.css     ← routes/agency/ActivityPage.css (194 lines)
│   │   │   ├── ApplicantsPage/
│   │   │   │   └── index.jsx            ← routes/agency/ApplicantsPage.jsx (231 lines)
│   │   │   └── OnboardingPage/
│   │   │       ├── index.jsx            ← routes/agency/OnboardingPage.jsx (643 lines → split)
│   │   │       ├── OnboardingSteps.jsx  ← extracted
│   │   │       └── OnboardingPage.css   ← routes/agency/OnboardingPage.css (484 lines)
│   │   ├── components/
│   │   │   ├── FilterBar.jsx            ← components/agency/FilterBar.jsx
│   │   │   ├── FilterBar.css            ← components/agency/FilterBar.css (215 lines)
│   │   │   ├── FilterPresetManager.jsx  ← components/agency/FilterPresetManager.jsx (295 lines)
│   │   │   ├── TalentCard.jsx           ← components/agency/TalentCard.jsx
│   │   │   ├── TalentCard.css           ← components/agency/TalentCard.css
│   │   │   ├── TalentDetailPanel.jsx    ← components/agency/TalentDetailPanel.jsx (250 lines)
│   │   │   ├── TalentDetailPanel.css    ← components/agency/TalentDetailPanel.css (309 lines)
│   │   │   ├── TalentPanel.jsx          ← components/agency/TalentPanel.jsx (248 lines)
│   │   │   ├── TalentPanel.css          ← components/agency/TalentPanel.css (358 lines)
│   │   │   ├── CastingPanel.jsx         ← components/agency/CastingPanel.jsx (261 lines)
│   │   │   ├── CastingPanel.css         ← components/agency/CastingPanel.css (450 lines)
│   │   │   ├── KanbanCard.jsx           ← components/agency/KanbanCard.jsx
│   │   │   ├── KanbanColumn.jsx         ← components/agency/KanbanColumn.jsx
│   │   │   ├── Kanban.css               ← components/agency/Kanban.css
│   │   │   ├── RichRow.jsx              ← components/agency/RichRow.jsx
│   │   │   ├── RichRow.css              ← components/agency/RichRow.css
│   │   │   ├── ActionButtonGroup.jsx    ← components/agency/ActionButtonGroup.jsx
│   │   │   ├── ActionButtonGroup.css    ← components/agency/ActionButtonGroup.css
│   │   │   ├── BulkActionToolbar.jsx    ← components/agency/BulkActionToolbar.jsx
│   │   │   ├── BulkActionToolbar.css    ← components/agency/BulkActionToolbar.css
│   │   │   ├── TagSelector.jsx          ← components/agency/TagSelector.jsx (252 lines)
│   │   │   ├── TagSelectorModal.jsx     ← components/agency/TagSelectorModal.jsx (257 lines)
│   │   │   ├── TagRemovalModal.jsx      ← components/agency/TagRemovalModal.jsx
│   │   │   ├── TagManager.jsx           ← components/agency/TagManager.jsx
│   │   │   ├── NotesPanel.jsx           ← components/agency/NotesPanel.jsx (228 lines)
│   │   │   ├── ActivityTimeline.jsx     ← components/agency/ActivityTimeline.jsx (199 lines)
│   │   │   ├── MessageThread.jsx        ← components/agency/MessageThread.jsx
│   │   │   ├── InterviewCard.jsx        ← components/agency/InterviewCard.jsx (253 lines)
│   │   │   ├── InterviewList.jsx        ← components/agency/InterviewList.jsx
│   │   │   ├── InterviewScheduler.jsx   ← components/agency/InterviewScheduler.jsx (242 lines)
│   │   │   ├── InterviewSection.jsx     ← components/agency/InterviewSection.jsx
│   │   │   ├── ReminderCard.jsx         ← components/agency/ReminderCard.jsx (274 lines)
│   │   │   ├── ReminderCreator.jsx      ← components/agency/ReminderCreator.jsx (265 lines)
│   │   │   ├── ReminderList.jsx         ← components/agency/ReminderList.jsx
│   │   │   ├── ReminderSection.jsx      ← components/agency/ReminderSection.jsx
│   │   │   ├── DueReminders.jsx         ← components/agency/DueReminders.jsx
│   │   │   ├── ConfirmationDialog.jsx   ← components/agency/ConfirmationDialog.jsx
│   │   │   ├── AgencySessionGate.jsx    ← components/agency/AgencySessionGate.jsx
│   │   │   ├── KeyboardShortcutOverlay.jsx ← components/agency/KeyboardShortcutOverlay.jsx
│   │   │   ├── KeyboardShortcutOverlay.css ← components/agency/KeyboardShortcutOverlay.css
│   │   │   ├── Grainient.jsx            ← routes/agency/Grainient.jsx (241 lines, visual component not a page)
│   │   │   ├── Grainient.css            ← routes/agency/Grainient.css
│   │   │   ├── nav/
│   │   │   │   ├── NotificationsDropdown.jsx ← components/agency/nav/NotificationsDropdown.jsx
│   │   │   │   ├── NotificationsDropdown.css ← components/agency/nav/NotificationsDropdown.css (221 lines)
│   │   │   │   ├── MessagesDropdown.jsx     ← components/agency/nav/MessagesDropdown.jsx
│   │   │   │   ├── MessagesDropdown.css     ← components/agency/nav/MessagesDropdown.css (257 lines)
│   │   │   │   ├── UserDropdown.jsx         ← components/agency/nav/UserDropdown.jsx
│   │   │   │   └── UserDropdown.css         ← components/agency/nav/UserDropdown.css
│   │   │   └── ui/
│   │   │       ├── AgencyButton.jsx
│   │   │       ├── AgencyCard.jsx
│   │   │       ├── AgencyEmptyState.jsx
│   │   │       ├── AgencyStatCard.jsx
│   │   │       ├── MatchScore.jsx
│   │   │       ├── MatchScoreRing.jsx
│   │   │       ├── TalentMatchRing.jsx
│   │   │       ├── TalentStatusBadge.jsx
│   │   │       ├── TalentTypePill.jsx
│   │   │       └── index.js
│   │   ├── hooks/
│   │   │   └── useStats.js              ← hooks/useStats.js
│   │   └── api/
│   │       └── agency.js               ← api/agency.js (739 lines)
│   │
│   ├── auth/
│   │   ├── pages/
│   │   │   └── LoginPage/
│   │   │       ├── index.jsx            ← routes/auth/LoginPage.jsx (596 lines)
│   │   │       └── LoginPage.css
│   │   ├── components/
│   │   │   └── TalentSpotlight.jsx      ← components/auth/TalentSpotlight.jsx (214 lines)
│   │   └── hooks/
│   │       └── useAuth.js              ← hooks/useAuth.js
│   │
│   └── onboarding/
│       ├── pages/
│       │   ├── CastingEntry/
│       │   │   └── index.jsx            ← routes/onboarding/CastingEntry.jsx (565 lines)
│       │   ├── CastingScout/
│       │   │   └── index.jsx            ← routes/onboarding/CastingScout.jsx (397 lines)
│       │   ├── CastingMeasurements/
│       │   │   └── index.jsx            ← routes/onboarding/CastingMeasurements.jsx (624 lines)
│       │   ├── CastingGender/
│       │   │   └── index.jsx            ← routes/onboarding/CastingGender.jsx
│       │   ├── CastingProfile/
│       │   │   └── index.jsx            ← routes/onboarding/CastingProfile.jsx (277 lines)
│       │   ├── CastingRevealPreview/
│       │   │   └── index.jsx            ← routes/onboarding/CastingRevealPreview.jsx (278 lines)
│       │   ├── CastingRevealRadar/
│       │   │   └── index.jsx            ← routes/onboarding/CastingRevealRadar.jsx (474 lines)
│       │   ├── CastingReview/
│       │   │   └── index.jsx            ← routes/onboarding/CastingReview.jsx
│       │   ├── CastingCallPage/
│       │   │   └── index.jsx            ← routes/onboarding/CastingCallPage.jsx (324 lines)
│       │   └── TestPreview/
│       │       └── index.jsx            ← routes/onboarding/TestPreview.jsx
│       ├── components/
│       │   ├── CinematicDivider.jsx     ← routes/onboarding/CinematicDivider.jsx
│       │   ├── CinematicNextButton.jsx  ← routes/onboarding/CinematicNextButton.jsx
│       │   ├── ThinkingText.jsx         ← routes/onboarding/ThinkingText.jsx
│       │   ├── ProgressIndicator.jsx    ← components/casting/ProgressIndicator.jsx
│       │   ├── ProgressIndicator.css    ← components/casting/ProgressIndicator.css
│       │   ├── RadarChart.jsx           ← components/casting/RadarChart.jsx
│       │   └── animations.js            ← routes/onboarding/animations.js
│       ├── styles/
│       │   ├── CastingCinematic.css     ← routes/onboarding/CastingCinematic.css (1,877 lines)
│       │   └── CastingCall.css          ← routes/onboarding/CastingCall.css (756 lines)
│       └── hooks/
│           └── useCasting.js            ← hooks/useCasting.js (238 lines)
│
├── shared/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── forms/
│   │   │   │   ├── PholioInput.jsx
│   │   │   │   ├── PholioSelect.jsx
│   │   │   │   ├── PholioTextarea.jsx
│   │   │   │   ├── PholioToggle.jsx
│   │   │   │   ├── PholioMultiSelect.jsx
│   │   │   │   ├── PholioCustomSelect.jsx
│   │   │   │   ├── PholioTagInput.jsx
│   │   │   │   ├── PholioMeasuringTape.jsx
│   │   │   │   ├── CreditsEditor.jsx
│   │   │   │   ├── PholioSection.jsx
│   │   │   │   ├── PholioForms.css      ← components/ui/forms/PholioForms.css
│   │   │   │   └── index.js            ← components/ui/forms/index.js
│   │   │   ├── ConfirmationDialog.jsx   ← components/ui/ConfirmationDialog.jsx (shared, distinct from agency one)
│   │   │   ├── GradientText.jsx         ← components/ui/GradientText.jsx
│   │   │   ├── GradientText.css         ← components/ui/GradientText.css
│   │   │   └── index.jsx               ← components/ui/index.jsx
│   │   ├── Header/
│   │   │   ├── Header.jsx              ← components/Header/Header.jsx (299 lines)
│   │   │   ├── Header.css              ← components/Header/Header.css
│   │   │   └── NotificationDropdown.jsx ← components/Header/NotificationDropdown.jsx (232 lines)
│   │   ├── ErrorBoundary.jsx            ← components/ErrorBoundary.jsx (193 lines)
│   │   ├── Breadcrumbs.jsx              ← components/Breadcrumbs.jsx
│   │   ├── CosmicBackground.jsx         ← components/CosmicBackground.jsx
│   │   ├── Card.jsx                     ← components/Card/Card.jsx
│   │   ├── StatCard.jsx                 ← components/StatCard/StatCard.jsx
│   │   ├── EmptyState.jsx              ← components/shared/EmptyState.jsx
│   │   ├── LoadingSpinner.jsx          ← components/shared/LoadingSpinner.jsx
│   │   ├── SharedStatCard.jsx          ← components/shared/StatCard.jsx (rename to avoid collision)
│   │   └── SkeletonOverview.jsx        ← components/loaders/SkeletonOverview.jsx
│   ├── layouts/
│   │   ├── AgencyLayout.jsx             ← layouts/AgencyLayout.jsx (287 lines)
│   │   ├── AgencyLayout.css             ← layouts/AgencyLayout.css (367 lines)
│   │   ├── DashboardLayoutShell.jsx     ← layouts/DashboardLayoutShell.jsx
│   │   ├── DashboardLayoutShell.css     ← styles/dashboard-shell.css (267 lines)
│   │   └── AuthLayout.jsx              ← layouts/AuthLayout.jsx
│   ├── styles/
│   │   ├── tokens.css                   ← styles/agency-tokens.css (182 lines) + styles/variables.css merged
│   │   ├── global.css                   ← styles/global.css (19,799 lines) — keep as-is for now, split is a separate task
│   │   ├── utilities.css                ← styles/utilities.css
│   │   ├── dark-overrides.css           ← styles/agency-dark-overrides.css
│   │   └── dashboard.css               ← styles/dashboard.css
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.js      ← hooks/useKeyboardShortcuts.js
│   │   ├── useTypeToFocus.js            ← hooks/useTypeToFocus.js
│   │   └── useFlash.jsx                ← hooks/useFlash.jsx
│   ├── lib/
│   │   ├── firebase.js                  ← lib/firebase.js
│   │   └── validation.js               ← lib/validation.js (339 lines)
│   └── utils/
│       ├── measurementConversions.js     ← utils/measurementConversions.js
│       ├── canvasUtils.js               ← utils/canvasUtils.js
│       ├── profileScoring.js            ← utils/profileScoring.js
│       ├── profileGating.js             ← utils/profileGating.js
│       ├── portfolioGapAnalysis.js      ← utils/portfolioGapAnalysis.js
│       └── fitScoring.js               ← utils/fitScoring.js (492 lines)
│
├── api/
│   ├── client.js                        ← api/client.js (shared fetch wrapper)
│   └── public.js                        ← api/public.js
├── data/
│   └── cities.js
├── schemas/
│   └── profileSchema.ts                ← schemas/profileSchema.ts
├── assets/
│   └── react.svg                        ← assets/react.svg
├── App.jsx                              ← updated imports
├── App.css
├── index.css                            ← fonts + Tailwind theme only
└── main.jsx
```

**Key frontend decisions:**

- `features/applicants/ApplicantsPageNew.jsx` (970 lines) — DEAD CODE, replaced by InboxPage. DELETE.
- `routes/agency/Grainient.jsx` — visual component, not a page. Moves to `agency/components/`.
- `routes/agency/PlaceholderPage.css` — orphaned CSS with no JSX. DELETE.
- `routes/PricingPage.jsx` — marketing page, doesn't belong in app codebase. DELETE.
- `styles/public.css` (19,799 lines) — appears to be a duplicate/copy of `global.css`. DELETE, keep only `global.css`.
- `styles/global.css` (19,799 lines) — too large to split in this reorganization. Keep as-is, flag as future task.
- `styles/reset.css`, `styles/ui.css` — merge into `global.css` during CSS consolidation.
- `styles/analytics.css` — moves with AnalyticsPage to talent domain.
- CSS files always travel with their JSX counterpart — same directory.
- `components/shared/StatCard.jsx` renamed to `SharedStatCard.jsx` to avoid collision with `components/StatCard/StatCard.jsx`.

---

## Migration Strategy

Five phases, each ending with a working app. No big bang.

### Phase 1: Purge

Delete dead code only. Zero structural changes.

1. Preserve `archive/` on `archive/legacy` git branch, then delete from main
2. Delete backup files: `*.bak`, `*.backup`, `build_error.txt`
3. Delete `public/STUDIO+_WEBSITE/`, `public/react-background-remover-master/`
4. Delete `src/routes/dashboard-talent/` and remove mount from `app.js`
5. Delete `src/lib/onboarding/state-machine.js` (legacy, replaced by casting-machine.js)
6. Delete `src/lib/config.js` (duplicate of `src/config.js`)
7. Delete stub pages + their CSS: `InterviewsPage.jsx/.css`, `RemindersPage.jsx/.css`, `SignedPage.jsx/.css`
8. Delete orphaned CSS: `PlaceholderPage.css`, `RemindersPage.css`
9. Delete `routes/PricingPage.jsx` (marketing page, doesn't belong in app)
10. Delete `features/applicants/ApplicantsPageNew.jsx` + related CSS (dead, replaced by InboxPage)
11. Delete `styles/public.css` (duplicate of global.css)
12. Remove routes to deleted pages from `App.jsx`
13. Add `.DS_Store` to `.gitignore` if not already present
14. Verify: `npm run dev:all`, test login + both dashboards

**Risk:** Low.

### Phase 2: Backend Restructure

Create domain directories, move files in dependency order.

1. Create full directory skeleton
2. Move `shared/` first (db, middleware, lib) — update imports immediately after each move
3. Move leaf domains: `ai/`, `pdf/`, `auth/`
4. Move `onboarding/` (depends on auth, shared)
5. Move `talent/` (depends on shared, auth)
6. Move `agency/` (depends on shared, auth) — **critical: `routes/api/agency.js` (5,297 lines) must be split into ~6 route files** (inbox, casting, tags, interviews, reminders, messages)
7. Delete `routes/api.js` mount file — replace with direct domain mounts in `app.js`
8. Split `lib/validation.js` (784 lines) → 3 domain schema files
9. Split `routes/onboarding.js` (1,357 lines) → thin route handler + services
10. Split `routes/pdf.js` (1,378 lines) → thin route handler + generator service
11. Extract SQL queries from route handlers → domain `queries/` files
12. Update `app.js` mounts to point at new domain index routes
13. Update test imports
14. Verify: `npm test && npm run dev:all`

**Import update strategy:** After each file move, grep for old path, update all references. No barrel re-exports or aliases — clean breaks only.

**Risk:** Medium. The `routes/api/agency.js` split is the highest-risk item — 5,297 lines must be carefully decomposed.

### Phase 3: Frontend Restructure

Same approach — create directories, move files, update imports.

1. Create full directory skeleton
2. Move `shared/` first (components/ui, layouts, styles, hooks, utils, lib)
3. Move `auth/` (LoginPage + useAuth + TalentSpotlight)
4. Move `onboarding/` (all casting pages + components + hooks + styles)
5. Move `talent/` (pages, components from features/, hooks, api)
6. Move `agency/` (pages, components, hooks, api — all with CSS companions)
7. CSS consolidation: merge `agency-tokens.css` + `variables.css` → `tokens.css`; merge `reset.css` + `ui.css` into `global.css`; move `dashboard-shell.css` to live with `DashboardLayoutShell.jsx`
8. Delete emptied old directories (`features/`, `routes/`, `components/`, `hooks/`)
9. Update `App.jsx` imports to new domain paths
10. Verify: `npm run client:dev`, click through all routes

**Risk:** Medium.

### Phase 4: Megafile Decomposition

Actual refactoring — extracting components from monoliths.

**Backend:**
1. `routes/api/agency.js` (5,297 lines) → split into inbox.js, casting.js, tags.js, interviews.js, reminders.js, messages.js

**Frontend:**
2. `ProfilePage.jsx` (1,397 lines) → index.jsx + IdentitySection, MeasurementsSection, PhotosSection, SocialSection
3. `CastingPage.jsx` (1,040 lines) → index.jsx + CastingCallBuilder, CastingMatchList, CastingRequirements
4. `OverviewPage.jsx` (833 lines) → index.jsx + KpiCards, RecentActivity, PipelineChart
5. `SettingsPage.jsx` (691 lines) → index.jsx + BrandingSection, TeamSection, OnboardingSection
6. `OnboardingPage.jsx` (643 lines) → index.jsx + OnboardingSteps
7. Visual verification after each page

**Risk:** Medium-high. Each file decomposed and verified individually.

### Phase 5: Cleanup & Documentation

1. Remove empty directories
2. Grep for dead imports, unused exports
3. Update `CLAUDE.md` to reflect new structure
4. Full verification: login → onboarding → talent dashboard → agency dashboard
5. Commit with updated documentation

---

## Deletion Inventory

### Deleted Permanently

| File/Directory | Reason |
|---|---|
| `client/src/styles/global.css.bak` | Backup |
| `client/tailwind.config.js.bak` | Backup |
| `src/lib/dashboard/completeness-old.js.backup` | Backup |
| `src/routes/agency.js.backup` | Backup |
| `client/build_error.txt` | Build artifact |
| `public/STUDIO+_WEBSITE/` | Dead marketing |
| `public/react-background-remover-master/` | Dead demo |
| `src/routes/dashboard-talent/` (6 files) | Legacy SSR, replaced by SPA |
| `src/routes/api.js` | Indirection layer, replaced by direct domain mounts |
| `src/lib/onboarding/state-machine.js` | Legacy, replaced by casting-machine.js |
| `src/lib/config.js` | Duplicate of src/config.js |
| `src/lib/dashboard/shared-utils.js` | Only used by deleted dashboard-talent routes |
| `src/lib/dashboard/template-helpers.js` | Only used by deleted dashboard-talent routes |
| `client/src/routes/agency/InterviewsPage.jsx` + `.css` | 20-line stub |
| `client/src/routes/agency/RemindersPage.jsx` + `.css` | 31-line stub |
| `client/src/routes/agency/SignedPage.jsx` + `.css` | 26-line deprecated |
| `client/src/routes/agency/PlaceholderPage.css` | Orphaned CSS |
| `client/src/routes/PricingPage.jsx` | Marketing page, doesn't belong in app |
| `client/src/features/applicants/ApplicantsPageNew.jsx` | Dead, replaced by InboxPage |
| `client/src/styles/public.css` | Duplicate of global.css (19,799 lines) |
| `client/src/layouts/DashboardLayout.jsx` | Legacy wrapper |

### Preserved on `archive/legacy` Branch

| Directory | Content |
|---|---|
| `archive/` | Legacy marketing site + background remover demo |

### Untouched

| Item | Reason |
|---|---|
| `migrations/` (94 files) | Migration history is sacred |
| `scripts/` (27 files) | Well-organized |
| `tests/` (8 files) | Stay at root, imports updated after restructure |
| `views/layout.ejs`, `views/auth/`, `views/portfolio/show.ejs` | Still used for SSR auth + portfolio |
| `knexfile.js`, `server.js`, `package.json` | Root config |
| `seeds/` | Keep as-is |

---

## Constraints

- App boots and both dashboards work after every single commit
- No barrel re-exports or path aliases — clean import path breaks only
- ~15-20 commits total, one per logical move + verification
- Migration history untouched
- Tests updated as part of each phase, not deferred
- CSS files always travel with their JSX counterpart

## Future Work (Out of Scope)

- `styles/global.css` (19,799 lines) — needs its own decomposition task
- `routes/chat.js` (1,105 lines) — could become its own domain if chat grows
- Test coverage expansion — currently 8 files for 130K lines of code
- `OverviewPage.css` (1,806 lines) — should be split when OverviewPage is decomposed
