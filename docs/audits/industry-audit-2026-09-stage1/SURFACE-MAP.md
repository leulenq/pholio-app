# Pholio Surface Map (auditor working doc)

Read-only inventory of every user-facing surface, built from code only (no `.claude/skills`, `docs/audits`, `tasks/`, or `docs/*audit*`). Client app root: `client/src`. Server root: `src`. EJS views: `views/`. Route mounting confirmed in `src/app.js`, `src/domains/talent/routes/index.js`, `src/domains/agency/routes/index.js`.

String counts are **rough scan counts** (grep of quoted literals ≥4 chars across each domain's `.jsx` files), not a literal-by-literal audit tally — they include non-visible strings (class names, keys, query keys) so treat as an *upper-bound budgeting number*, not ground truth. Per-domain raw JSX literal-scan totals for reference: onboarding ~1,373, auth ~428, talent ~7,968, agency ~5,370, events ~100, opencall ~581, messaging ~43, moderation ~108, internal ~62.

---

## TALENT SIDE

### 1. Onboarding `/onboarding` flow
Route: `/onboarding` (talent), `/onboarding/test` (preview). Client route table: `client/src/App.jsx:79-81`.

- Entry/orchestrator: `client/src/domains/onboarding/pages/CastingCallPage.jsx` (step machine), state hook `client/src/domains/onboarding/hooks/useCasting.js`.
- Steps (each own component, imported by CastingCallPage unless noted):
  - Entry/name: `CastingEntry.jsx` (+ `.screen.css`)
  - Birthdate: `CastingBirthdate.jsx` — referenced only from `useCasting.js` (rendered as a sub-step of entry/gender flow, not a top-level import of CastingCallPage)
  - Gender: `CastingGender.jsx` (+ `GenderTiles.jsx`, `.screen.css`)
  - Measurements: `CastingMeasurements.jsx` (+ `.screen.css`)
  - Profile: `CastingProfile.jsx` (+ `.screen.css`)
  - Scout (agency/discovery source): `CastingScout.jsx` (+ `.screen.css`)
  - Verify email: `CastingVerifyEmail.jsx`
  - Acknowledgment: `AcknowledgmentBeat.jsx`
  - Open-call arrival (talent lands via an agency open-call link mid-onboarding): `OpenCallArrivalPage.jsx` (+ `.css`), tested in `pages/__tests__/OpenCallArrivalPage.test.jsx`
  - Test/QA preview of the scout step: `TestPreview.jsx` (route `/onboarding/test`)
- Shared onboarding chrome: `ActionDock.jsx`/`.css`, `ActionDockContext.jsx`, `ColorSelect.jsx`/`.css`, `LanePlates.jsx`/`.css`, `SpotlightField.jsx`/`.css`, `StepBeat.jsx`, `ProfileUnlockExperience.jsx` (post-gate unlock celebration, also used by `DashboardLayoutShell.jsx`), `CinematicDivider.jsx`, `CinematicNextButton.jsx`, `ThinkingText.jsx`, `animations.js`.
- Agency onboarding variant lives in same folder but is agency-side: `AgencyOnboardingPage.jsx`, `OnboardingSteps.jsx`, `agencyOnboardingSteps.js` — see Group 14.
- API calls: `client/src/domains/talent/api/talent.js` (shared client), hitting `src/domains/onboarding/routes/casting.js` (mounted pre-auth, see `src/app.js:722` limiter `onboardingLimiter`) and `src/domains/onboarding/routes/apply-essentials.js`. Validation helpers: `src/domains/onboarding/validation/*`. Server-returned copy is inline `message:` strings in `casting.js` (e.g. "Date of birth is required before account creation.", "Please select how you identify before continuing.") — not a shared label map.
- Analytics/telemetry (not user-visible but touches this flow): `src/domains/onboarding/analytics/*`, `src/domains/onboarding/services/*`.
- No generated artifact from this flow itself (comp card / PDF generation happens later, see Group 6).
- Approx string budget: ~120-160 visible strings (step copy, field labels, validation hints, CTA labels) across ~20 component files.

### 2. Auth (login, forgot/reset, EJS views, error EJS)
Routes: `/login`, `/login/forgot-password`, `/reset-password` (all under `AuthLayout` route element, `App.jsx:84-88`); `/auth/instagram/callback`; dev-only `/dev/preview/auth-entry`.

- Entry files: `client/src/domains/auth/pages/LoginPage/LoginPage.jsx` (+`.module.css`), `ForgotPasswordPage/ForgotPasswordPage.jsx`, `ResetPasswordPage/ResetPasswordPage.jsx` (tested `__tests__/ResetPasswordPage.test.jsx`), `InstagramCallbackPage.jsx`.
- Shared auth chrome: `client/src/shared/layouts/AuthLayout.jsx`/`.module.css`, `client/src/domains/auth/components/AuthEntrySplash.jsx`/`.css`, `AuthEntryTransitionProvider.jsx`, `TalentSpotlight.jsx`, preview harness `pages/AuthEntrySplashPreview.jsx`/`.css`.
- Hooks/lib (drive copy state): `useAuth.js`, `useAuthEntry.js`, `useAuthenticatedEntryRedirect.js`, `lib/auth-entry-context.js`, `lib/entry-identity.js`, `lib/instagram-auth.js` (+ test), `lib/spa-navigation.js`.
- Server-rendered EJS (pre-React, served by Express directly): `views/auth/login.ejs`, `views/auth/partners.ejs`, layout `views/layout.ejs`. Error pages: `views/errors/403.ejs`, `404.ejs`, `422.ejs`, `500.ejs`, rendered by `src/shared/middleware/error-handler.js` (`renderErrorPage`) when the request does not want JSON.
- API: `src/domains/auth/routes/auth.js` (login, password reset, session), `src/domains/auth/routes/instagram-auth.js`, middleware `src/domains/auth/middleware/require-auth.js`. Message sources: inline `message:` literals in `auth.js` (e.g. "Enter a valid email address.", "This account is already linked to a different sign-in method.", "Finish creating your Pholio account to continue."), plus Firebase SDK error surfaces mapped client-side.
- Emails triggered from this surface: `sendPasswordResetEmail`, `sendEmailVerificationEmail`, `sendSignInMethodNoticeEmail`, `sendPasswordChangedEmail`, `sendNewDeviceSignInEmail` — see Group 27.
- Approx string budget: ~60-80 (form labels, validation, error EJS copy, splash copy).

### 3. Dashboard shell / nav / right sidebar / notification bell
- Talent shell: `client/src/shared/layouts/TalentLayout/index.jsx` (+`.css`), mobile nav `MobileTabBar.jsx`/`.css`, section labels from `client/src/shared/constants/talentNav.js` (`TALENT_NAV_SECTIONS`).
- Route gate/wrapper: `client/src/shared/layouts/DashboardLayoutShell.jsx` (profile-gate banners, legal-acceptance gate, unlock experience).
- Right sidebar: `client/src/domains/talent/components/RightSidebar/RightSidebar.jsx`/`.css`, `SidebarActions.jsx`, `SidebarProfile.jsx`, `SidebarWidget.css`.
- Notification bell (talent): `client/src/shared/components/NotificationCenter/NotificationCenter.jsx`/`.css`, `NotificationInbox.jsx`/`.css`, `TalentSignalPanel.jsx`/`.css`, model/helpers `talentSignalModel.js`, `notificationHelpers.js`, `talentNotifications.js`, unread-count hook `useNotificationUnreadCount.js`.
- Agency shell (parallel surface, see Group 14 for full agency chrome): `client/src/shared/layouts/AgencyLayout.jsx`/`.css`, nav `client/src/domains/agency/components/nav/*` (RailNav, CoBrandLockup, MemberAccountChip, TeamPresence, MessagesDropdown, NotificationsDropdown, UserDropdown).
- API: talent notifications `GET/PATCH /api/talent/notifications*` → `src/domains/talent/routes/notifications.js`; agency notifications → `src/domains/agency/routes/notifications.js`. Underlying writer/label source: `src/shared/services/notifications.js` (see Group 28).
- Approx string budget: ~40-60 (nav labels, empty/inbox states, tooltip copy).

### 4. Overview page
Route: `/dashboard/talent` (`App.jsx:129`).
- Entry: `client/src/domains/talent/pages/OverviewPage/index.jsx` (+`.css`).
- Children: `OpenCallsCard.jsx` (tested `__tests__/OpenCallsCard.test.jsx`), `client/src/domains/talent/components/StatsCurrencyPrompt.jsx`, readiness widget from `client/src/domains/talent/components/profileReadinessItems.js`.
- Hooks: `useProfileReadiness`, `useAnalytics` (`client/src/domains/talent/hooks/`).
- API: `talentApi` (`client/src/domains/talent/api/talent.js`) → `src/domains/talent/routes/dashboard.js` (mounted `/api/talent`), plus `analytics.js` route for stats.
- No generated artifacts.
- Approx string budget: ~30-40.

### 5. Profile page (all tabs/sections)
Route: `/dashboard/talent/profile` (`App.jsx:130`).
- Entry: `client/src/domains/talent/pages/ProfilePage/index.jsx` (+`.module.css`).
- Section components (each a tab/section rendering its own visible copy):
  - Identity: `IdentitySection.jsx` (page-local) — note there is also a duplicate/legacy `client/src/domains/talent/components/IdentitySection.jsx`.
  - Discipline/division: `DisciplineSection.jsx`
  - Measurements: `MeasurementsSection.jsx`
  - Availability / booking lanes: `AvailabilitySection.jsx`, `BookingLanesControl.jsx`, `bookingLaneSignals.js`
  - Socials: `SocialSection.jsx`, `client/src/domains/talent/components/SocialInput.jsx`, connectors via `phylloWrapper.js`
  - Representation: `client/src/domains/talent/components/RepresentationSection.jsx`
  - Verified-adult / age gate: `VerifiedAdultSection.jsx`/`.module.css` (+ test), `ageVerificationState.js`, `stripeIdentity.js`
  - Visibility/consent mock: `MockConsentPage.jsx`/`.module.css` (mock OAuth consent used by socials linking, route `/socials/oauth/mock/:platform`)
  - Nav: `client/src/domains/talent/components/ProfileNav.jsx`, `profileNavItems.js`
  - Readiness sidebar: `client/src/domains/talent/components/ProfileReadinessSidebar.jsx`/`.module.css`, `ProfileReadinessAudit.jsx`/`.module.css`, `profileReadinessItems.js`
  - Save/flush logic (no UI but touches validation errors surfaced in form): `flushProfileFormForSave.js`
- Schema: `client/src/schemas/profileSchema.js` (client-side zod-like validation, drives inline field errors).
- API: `talentApi` → `src/domains/talent/routes/profile.js`, `field-visibility.js`, `representations.js`, `age-verification.js`, `social-oauth.js`, `phyllo-routes.js` (all mounted `/api/talent`, see `src/domains/talent/routes/index.js:51-55,60`).
- Approx string budget: ~250-350 (largest single-page surface: many field labels, hints, validation messages, section headers).

### 6. Media / The Book page
Route: `/dashboard/talent/media` (`App.jsx:131`).
- Entry: `client/src/domains/talent/pages/MediaPage/index.jsx` → `client/src/domains/talent/components/MediaWorkspace.jsx`/`.css` (main workspace).
- Upload/frames: `FrameEditor.jsx`/`.css`, `PhotoEditorModal.jsx`/`.css`, `ImageMetadataModal.jsx`/`.css`, `PhotosTab.jsx`, `HeroCard.jsx`/`.css`.
- Taxonomy: labels from `client/src/shared/constants/frameTaxonomy.js` (`SHOT_LABELS`, `FRAME_TYPE_OPTIONS`, `IMAGE_TYPE_LABELS`), rendered via `client/src/shared/components/frame/FrameTaxonomyLabel.jsx`, `FrameReviewStateLabel.jsx`, `reviewStateLabel.js`, `FrameReadCaption.jsx` (AI-read caption display).
- Digitals: `DigitalsContactSheet.jsx`/`.css`, `DigitalsFreshness.jsx`/`.css` (+ test).
- AI reads / classification: `ClassificationReviewStrip.jsx`/`.css`.
- Comp card: `CompCard.jsx`/`.css` (editions selector, preview, "Add to Apple Wallet" badge link `/api/talent/wallet/pass`), `CompCardGate.jsx`/`.css` (paywall), `CompCardStatsNudge.jsx` + `compCardStatsNudgeHelpers.js`, import flow `CompCardImport/CompCardImport.jsx`/`.module.css`, `CompCardImportOverlay.jsx`/`.module.css` (+ tests).
- Registry/preflight banner: `RegistryPreflight.jsx`/`.module.css` (+ test) — surfaces `src/domains/spec-registry/preflight-service.js` output.
- BioWriter (AI bio assist): `client/src/domains/talent/components/BioWriter/BioWriter.jsx`/`.module.css`.
- API: `talentApi` → `src/domains/talent/routes/media.js`, `digitals.js`, `comp-card-import.js`, `external-comp-cards.js`, `bio.js`, `spec-registry.js`, `pdf-custom.js` (all `/api/talent/...`, see mounting `src/domains/talent/routes/index.js:44-50,63,65`).
- Generated artifacts: comp-card PDFs via `src/domains/pdf/generator.js` + composition pipeline `src/domains/pdf/composition/*` + EJS templates `src/domains/pdf/templates/compcard.ejs`, `compcard-standard.ejs`, `compcard-composed.ejs`, `digitals-sheet.ejs`; served by `src/domains/pdf/routes/pdf.js`. Edition scoring/labels: `composition/front-program/edition-scoring.js`, `edition-structures.js`.
- Approx string budget: ~150-200.

### 7. Applications / Market
Routes: `/dashboard/talent/applications/apply` (pre-shell, `App.jsx:124`), `/dashboard/talent/applications` (`App.jsx:134`), `/dashboard/talent/open-calls` (`App.jsx:125`), `/dashboard/talent/applications/requirements` → dead redirect to `/dashboard/talent/applications` (`App.jsx:139-142`, comment confirms standalone requirements page is gone).

- **ApplyPage (dossier/apply flow)**: entry `client/src/domains/talent/pages/ApplyPage/index.jsx` → `ApplyExperience.jsx` (+`.css`, main scene machine). Sub-scenes: `SubmissionTerms.jsx`, `SubmissionThreshold.jsx`, event intake `event/EventIntakeScene.jsx`/`.css`, `event/eventIntake.js`, `event/useEventIntake.js`. Off-Pholio prepare/export flow: `offPholio/AgencyBriefScene.jsx`/`.module.css` (agency detail content from `client/src/domains/talent/content/agencyBriefs.js`), `offPholio/PrepareScene.jsx`/`.css`, `offPholio/HandoffScene.jsx`/`.css`, `offPholio/offPholioIntake.js`, `offPholio/useOffPholioTarget.js` (all with `__tests__`). Draft persistence: `applicationDraftStorage.js`, `submissionConsentBinding.js`.
- **ApplicationsPage (tracker)**: entry `client/src/domains/talent/pages/ApplicationsPage/index.jsx` → `client/src/domains/talent/components/ApplicationsView.jsx`/`.css`. Children: `ApplicationMessages.jsx`/`.css`, market components `market/MarketBoard.jsx`, `market/HouseBand.jsx`, `market/HouseBrief.jsx` (+ `useHouseBrief.js`), `market/MarketCoverage.jsx` (+ test, `useMarketCoverage.js`), `market/SubmissionLedger.jsx`, `market/SubmissionRecord.jsx`; tracker widgets `tracker/LogSubmissionOverlay.jsx`/`.module.css` (+ test), `tracker/TrackerDetail.jsx`.
- **OpenCallsPage**: `client/src/domains/talent/pages/OpenCallsPage/index.jsx`/`.css` (+ test) — lists agency open calls for the talent to browse/apply.
- Status label source: `client/src/domains/talent/utils/applicationStatus.js` (`statusConfig()`, `bucketCounts()`), `representationStatus.js`.
- API: `talentApi` → `src/domains/talent/routes/applications.js`, `tracker.js`, `agencies.js`, `submission-note.js`, `call-windows.js`, `availability.js`; open-call apply/materials endpoints are cross-referenced with public flow (`src/domains/opencall/routes/apply.js`, `materials.js` — see Group 12).
- Server message/status labels reaching UI: `src/shared/constants/application-status.js`, `src/shared/constants/event-casting.js`, `src/shared/services/notifications.js` (title strings listed in Group 28).
- Approx string budget: ~300-400 (largest talent surface after Profile — dossier scenes, off-Pholio copy, tracker states).

### 8. Intel page
Route: `/dashboard/talent/intel` (`App.jsx:133`); `/dashboard/talent/analytics` redirects here.
- Entry: `client/src/domains/talent/pages/IntelPage/index.jsx`/`.css`, chrome `Chrome.jsx`.
- Blocks: `blocks/DecisionStack.jsx`, `blocks/SubmissionsBlock.jsx`, `blocks/MaterialsBlock.jsx`, `blocks/AttentionBlock.jsx`, `blocks/BookBlock.jsx`, `blocks/MomentumBlock.jsx`, `blocks/ShareLinksBlock.jsx` (+ test).
- Charts (labels/axis text): `charts/ConversionLadder.jsx`, `CurrencyAxis.jsx`, `IntentTrend.jsx`, `MarketBars.jsx`, `RankedBars.jsx`, `ReadClock.jsx`, `StackedShare.jsx`, `WeeklyBars.jsx`, `chartKit.jsx`, `chartUtils.js`.
- Copy/logic: `findings.js` (+ test), `intelTheme.js`.
- API: `useIntel` hook → `src/domains/talent/routes/intel.js`, `analytics.js`, `training-summary.js`.
- Approx string budget: ~80-120 (mostly numeric/chart labels + finding sentences generated from `findings.js`).

### 9. Messages
Route: `/dashboard/talent/messages` (`App.jsx:143`).
- Entry: `client/src/domains/talent/pages/MessagesPage/index.jsx`/`.css` → `client/src/domains/talent/components/ApplicationMessages.jsx`/`.css`.
- API: `talentApi` → `src/domains/talent/routes/messages.js`, AI assist `message-polish.js`.
- Related standalone public surface: magic-link reply page, see Group 12 (`/reply/:token`).
- Approx string budget: ~30-50.

### 10. Settings (all sections)
Route: `/dashboard/talent/settings`, `/dashboard/talent/settings/:section` (`App.jsx:144-145`).
- Entry: `client/src/domains/talent/pages/SettingsPage/index.jsx`/`.css` — a single file containing all section components as inline functions (`IdentityMovement`, `PresenceMovement`, `NotificationsMovement`, `StudioMovement` [plan/Studio+/billing], `SecurityMovement`, `PrivacyMovement`, `LegalMovement`, `AccountMovement` [account deletion]), plus imported `LikenessMovement.jsx` (AI consent + marketing-use consent, wallet-adjacent) — see section list at `index.jsx:73` (`identity`, `presence`, `notifications`, `studio`, `security`, `privacy`, `legal`, `likeness`, `account`).
- Shared primitives: `primitives.jsx` (`Movement`, `Row`, `SkeletonRows`), `identityForm.js`, `identityFormFromProfile.js` (+ test), `studioCopy.js` (`STUDIO_LEDE`, `portalReturnStatus`).
- Billing/Studio+ subcomponents: `client/src/shared/components/SubscriptionCheckoutDisclosure.jsx` (`SubscriptionCheckoutModal`), `client/src/shared/components/billing/CheckoutHandoff.jsx`/`.css`, `SubscriptionReturnBanner.jsx`/`.css`, `PholioBillingWordmark.jsx`/`.css`, `client/src/shared/hooks/useBrandedStripeCheckout.js`.
- Wallet pass entry point is on Media page (`CompCard.jsx`), not Settings — see Group 6/29.
- Report dialog (safety, feeds Group 33 moderation): `client/src/shared/components/ReportDialog.jsx`.
- Account deletion strings: inline in `AccountMovement` (`index.jsx` ~L1382-1450), e.g. "Delete account", "Delete everything and sign out for good?", toasts "Account paused" / "Account deleted" / "Your Pholio account was removed. Provider deletion is still pending."
- AI-consent disclosure copy: `LikenessMovement.jsx` (marketing-use vs AI-likeness-use, two independent grants; long consent-copy strings around L462-520).
- API: `talentApi` → `src/domains/talent/routes/settings.js`, `notifications.js` (prefs), `guardian-consent.js`, wallet `../../wallet/routes/talent-wallet.js` (mounted `/api/talent/wallet`), Firebase client SDK (`sendPasswordResetEmail`) for password reset. Stripe billing via `useBrandedStripeCheckout` hitting Stripe routes (`src/routes/stripe.js`).
- Approx string budget: ~300-400 (this is the largest concentration of legal/consent/billing copy in the app — flag for careful audit).

### 11. Reveal page
Routes `/reveal` and `/dashboard/talent/reveal` are now **dead redirects to `/dashboard/talent`** (`App.jsx:103-108`, comment: "The post-onboarding reveal is gone; old links land on the dashboard."). No reveal-specific component files remain in the client tree (confirmed no `*Reveal*` files under `client/src`). Nothing to audit here beyond the redirect itself.

### 12. Public-facing (pre-auth)
- **Open call apply**: `/opencall/:code` → `client/src/domains/opencall/pages/OpenCallApplyPage.jsx` (+ test). Renders anonymous form or arrival page depending on link type. Shared stage components: `client/src/domains/opencall/components/StageShell.jsx`, `ActionDock.jsx`, `AttestationStatement.jsx`, `GenderTiles.jsx`, `MediaFrames.jsx`, `Question.jsx`, `SpotlightField.jsx`, `OpenCallStage.css`, copy modules `callCopy.js`, `consentCopy.js`, `motion.js`. API client `client/src/domains/opencall/api/opencall.js` → `src/domains/opencall/routes/apply.js` (mounted `/api/public/opencall`, rate-limited `onboardingLimiter` at `src/app.js:722`).
- **Claim / disown / materials token pages**: `client/src/domains/opencall/pages/ClaimPage.jsx` → `src/domains/opencall/routes/claim.js`; `DisownPage.jsx` → same route file (disown action); Materials: `client/src/domains/opencall/materials/MaterialsPage.jsx`/`.css` (+ test), `materials/api.js` → `src/domains/opencall/routes/materials.js` and `src/domains/agency/routes/materials.js` (agency-side "request more materials" counterpart, see Group 16). Routes in App.jsx: `/opencall/claim/:token`, `/opencall/disown/:token`, `/opencall/materials/:token` (`App.jsx:115-117`).
- **`/reply/:token`** (magic-link message reply, no login wall): `client/src/domains/messaging/pages/ReplyPage.jsx`/`.css` (+ test `api/__tests__/reply.test.js`), api `client/src/domains/messaging/api/reply.js` → `src/domains/messaging/routes/message-reply.js` (mounted at app root, `src/app.js:885`).
- **`/picks/:token`** (designer pick list, token-only, no account): `client/src/domains/events/pages/PickListPage.jsx`/`.css`, `client/src/domains/events/components/PickCard.jsx`, api `client/src/domains/events/api/picks.js` → `src/domains/events/routes/pick-share.js` (mounted at app root, `src/app.js:890`).
- **Guardian consent EJS** (server-rendered, minor talent's guardian confirms consent via emailed link): `views/guardian-consent.ejs`, route handler `src/domains/talent/routes/guardian-consent.js`, email trigger `sendGuardianConsentEmail` in `src/shared/lib/email.js`.
- **Portfolio EJS views** (public comp-card/portfolio pages, e.g. `/p/:slug`): `views/portfolio/show.ejs`, `views/portfolio-pro.ejs`, server route `src/routes/portfolio.js`, `src/routes/pro.js`.
- Approx string budget: ~150-200 across all public surfaces combined.

### 13. Moderation queue page
Route: `/dashboard/moderation` (`App.jsx:146`, inside the talent `DashboardLayoutShell`, gated by moderator role server-side).
- Entry: `client/src/domains/moderation/pages/ModerationQueuePage.jsx`/`.css`.
- API: `src/domains/moderation/routes/reports.js` (mounted `/api`, `src/app.js:903`) — report/queue actions, CSAM-status workflow. Message sources are inline `message:` literals in `reports.js` (e.g. "Moderator access required.", "A safety report cannot target the reporting account itself.", `status must be one of: ...` built from `VALID_STATUSES`/`VALID_CSAM_STATUSES` constants in the same file).
- Report submission entry point (talent-facing trigger): `client/src/shared/components/ReportDialog.jsx` (Settings page, Group 10).
- Approx string budget: ~40-60.

---

## AGENCY SIDE

### 14. Setup / onboarding
Route: `/dashboard/agency/setup` (`App.jsx:154`, also `/dashboard/agency/onboarding` redirects here); gated by `AgencySessionGate` (`client/src/domains/agency/components/AgencySessionGate.jsx`, + test) and legal acceptance `AgencyLegalAcceptanceGate.jsx`/`.css` (+ test).
- Entry: `client/src/domains/agency/pages/SetupPage/index.jsx`.
- Children: `WelcomeScreen.jsx`, `SetupStage.jsx`, `SetupHeader.jsx`, `OptionRow.jsx`, chapter/step content `chapters.js`, `.css`.
- Agency step-machine variant shared with talent onboarding folder: `client/src/domains/onboarding/pages/AgencyOnboardingPage.jsx`, `OnboardingSteps.jsx`, `agencyOnboardingSteps.js` (see Group 1 note).
- API: `client/src/domains/agency/api/setup.js` → `src/domains/agency/routes/setup.js`, legal → `src/domains/agency/routes/legal.js`.
- Approx string budget: ~80-120.

### 15. Overview
Route: `/dashboard/agency` (`App.jsx:156`).
- Entry: `client/src/domains/agency/pages/OverviewPage.jsx`/`.css`.
- Children: `components/overview/ActivityFeed.jsx`, `BoardsTable.jsx`, `NextMoves.jsx`, `TalentStrip.jsx`, `TeamModule.jsx`, `TodayDocket.jsx`, data shaping `overviewData.js` (`selectKpis` also used by `AgencyLayout.jsx` for header KPIs).
- API: `client/src/domains/agency/api/agency.js` → `src/domains/agency/routes/overview.js`, queries `src/domains/agency/queries/overview.queries.js`.
- Approx string budget: ~60-90.

### 16. Submissions inbox (ApplicantsPage)
Route: `/dashboard/agency/submissions` (`App.jsx:158`; `/inbox`, `/applicants` redirect here).
- Entry: `client/src/domains/agency/pages/ApplicantsPage.jsx`/`.css`.
- Filters/rows/panels: `components/zones/ApplicantsZone.jsx`, `components/BoardSelect.jsx`/`.css`, `components/ui/FilterChips.jsx`/`.css`, `components/ui/StatusCell.jsx`/`.css`, `components/ui/StatusText.jsx`/`.css`, `components/meta/*` (Figure, MetaLine, Moment, Notation, Place).
- Review drawer: `components/review/ReviewRoom.jsx`/`.css` (+ tests).
- Decline flow: `components/decline/DeclineReasonModal.jsx`/`.css`, `DeclineReasonFields.jsx`/`.css` (+ tests).
- "Kept on file" and material-request actions live inside `ReviewRoom.jsx` / `ApplicantsPage.jsx` action bar, backed by `src/domains/agency/routes/inbox.js` (large route file — decline, kept-on-file, CSV export, material requests all in here) and `src/domains/agency/routes/materials.js` (materials-requested email trigger, `subject: \`${agencyName} shortlisted you — a few more things\``).
- Comparison overlay (multi-select compare): `components/ComparisonOverlay.jsx`/`.css` (+ test).
- Keyboard shortcuts help: `components/ShortcutHelp.jsx`/`.css`.
- API: `client/src/domains/agency/api/agency.js` → `src/domains/agency/routes/inbox.js` (zod validation present, see Group 32), `notify-talent-application.js`/`notifications.js` service for talent-facing notices triggered by agency actions here.
- Generated artifact: CSV export at `GET /api/agency/export` (`src/domains/agency/routes/inbox.js` ~L3167-3620), filename `pholio-applications-<date>.csv`.
- Approx string budget: ~200-260 (row/status vocabulary, decline reason taxonomy, drawer copy).

### 17. TalentFullView
Route: `/dashboard/agency/talent/:applicationId` (`App.jsx:171`).
- Entry: `client/src/domains/agency/pages/TalentFullView.jsx`.
- Dossier components: `components/dossier/DossierPlate.jsx`, `ReadoutBand.jsx`, `CalendarLine.jsx`, `DigitalsSet.jsx`, `SeasonMemory.jsx`, `TheBook.jsx`, `StandingRail.jsx`, `WorkingRecord.jsx`, `DecisionDock.jsx`, `DossierPrimitives.jsx` (`Sheet`), model helpers `dossierModel.js` (+ `.css`, tests under `dossier/__tests__`).
- API: `getTalentDossier` in `client/src/domains/agency/api/agency.js` → `src/domains/agency/routes/talent-dossier.js`.
- Approx string budget: ~80-100.

### 18. Signing boards (CastingPage/Detail/NewModal)
Routes: `/dashboard/agency/signing` (`App.jsx:161`), `/dashboard/agency/signing/:boardId` (`App.jsx:162`); legacy `/dashboard/agency/casting[/:boardId]` redirect via `LegacyAgencySigningRedirect`.
- Board list entry: `client/src/domains/agency/pages/CastingPage.jsx`/`.css`.
- Board detail (lanes/columns): `client/src/domains/agency/pages/CastingDetailPage.jsx`.
- New-board modal: `client/src/domains/agency/pages/CastingNewModal.jsx`.
- Lane/column primitives: `components/TalentPanel.jsx`/`.css`, `components/BoardIdentityEditor.jsx`/`.css`, `components/BoardSelect.jsx`/`.css`, `components/status/*` (`BoardPlate.jsx`, `StageProgress.jsx`, `DivisionMark.jsx`, `DivisionSet.jsx`, `AvailabilityCell.jsx`, `TypeSpec.jsx`) with label maps in `statusConfig.js`, `divisions.js` (+ tests).
- Decline flow reused here too (`components/decline/*`).
- API: `client/src/domains/agency/api/agency.js` (`getBoards`, `createBoard`) → `src/domains/agency/routes/casting.js`, `casting-stage-helpers.js`.
- Approx string budget: ~120-160.

### 19. Discover
Route: `/dashboard/agency/discover` (`App.jsx:165`).
- Entry: `client/src/domains/agency/pages/DiscoverPage.jsx`/`.css`.
- Children: `components/zones/DiscoverZone.jsx`, `components/scout/ScoutRoom.jsx`/`.css` (+ tests), `components/BriefLine.jsx`/`.css` (+ test), `pages/Grainient.jsx`/`.css` (visual chrome), `components/status/DivisionMark.jsx`, `components/meta/Place.jsx`.
- Intent parsing (search-to-filter copy): `lib/intentParser.js`.
- API: `getDiscoverableTalent`, `inviteTalent`, `getAgencyProfile` (`client/src/domains/agency/api/agency.js`) → server discover services `src/domains/agency/services/discover/*` (incl. `field-whitelist.js`), route not separately listed under `routes/` — check `roster.js`/`inbox.js` for discover endpoints if deeper audit needed.
- Approx string budget: ~80-100.

### 20. Events & event call pages, pools, pick lists, offers
Routes: `/dashboard/agency/events` (`App.jsx:166`), `/dashboard/agency/events/:linkId` (`App.jsx:167`).
- Events list entry: `client/src/domains/agency/pages/EventsPage.jsx`.
- Event call detail entry: `client/src/domains/agency/pages/EventCallPage.jsx` — embeds `ApplicantsPage.jsx` (as the pool/applicant list for the call), `events/PickListsPanel.jsx` (pick lists/offers), `events/LineupPanel.jsx`.
- Formatting/label helpers: `events/eventFormat.js` (`formatEventDates`, `formatCompensation`), `events/useEventCalls.js`.
- Public/shared pick-list page (designer-facing, token access): see Group 12 (`PickListPage.jsx`).
- API: `getEventCall` (`agency.js`) → `src/domains/agency/routes/events.js`; server pick-list service `src/domains/agency/services/event-pick-lists.js`; public pick-share route `src/domains/events/routes/pick-share.js`; offer/slot emails `sendEventSlotConfirmedEmail`, `sendEventSlotDeclinedEmail` (`src/shared/lib/email.js`).
- Approx string budget: ~150-200.

### 21. Team
Route: `/dashboard/agency/team` (`App.jsx:170`).
- Entry: `client/src/domains/agency/pages/TeamPage.jsx`/`.css`.
- Children: `components/TeamMemberCard.jsx`, `components/TeamAddModal.jsx`, `components/TeamPermissionsModal.jsx`, `components/TeamRolesGuide.jsx`, role helpers `components/team-presence.js`.
- Permission gates: `hooks/useAgencyPermissions.js` (`useCanManageTeam`, `useCanManageOrg`).
- API: `getAgencyProfile`/team endpoints (`agency.js`) → `src/domains/agency/routes/team-rbac.js` (zod-validated, Group 32).
- Team invite email: `sendTeamInviteEmail` (`src/shared/lib/email.js`).
- Approx string budget: ~60-90.

### 22. Settings
Route: `/dashboard/agency/settings` (`App.jsx:169`).
- Entry: `client/src/domains/agency/pages/SettingsPage.jsx`/`.css`.
- Panels: `settings/ProfilePanel.jsx`, `BrandingPanel.jsx`, `NotificationsPanel.jsx`, `SecurityPanel.jsx`, `OpenCallPanel.jsx` (+ test, + `openCallBrief.js`, `OpenCallBriefFields.jsx`), `SpecBuilderPanel.jsx`/`.css` (+ test — spec-registry authoring UI, see Group 30), `ExportWebhookPanel.jsx` (+ test — CSV/webhook config, see Group 25), `EventCallFields.jsx`.
- Agency social fields: `components/settings/AgencySocialSection.jsx`/`.css`, `agency-social-fields.js`.
- API: `getAgencyProfile` (`agency.js`) → `src/domains/agency/routes/setup.js`, `spec-builder.js`, `export-webhook.js`, `open-call.js`, `notifications.js`.
- Approx string budget: ~200-260 (spec builder + open-call brief + webhook config are copy-heavy).

### 23. Messages
Route: `/dashboard/agency/messages` (`App.jsx:172`).
- Entry: `client/src/domains/agency/pages/MessagesPage.jsx`/`.css`.
- Nav dropdown variant: `components/nav/MessagesDropdown.jsx`/`.css`.
- Thread component reused from dossier: `components/talent/TalentThread.jsx`/`.css`, `components/talent/TalentActionBar.jsx`/`.css`.
- API: `getMessageThreads`, `getMessages`, `sendMessage`, `markMessageAsRead` (`agency.js`) → `src/domains/agency/routes/messages.js`.
- New-message notification/email: `notifyAgencyNewMessage` (`src/shared/services/agency-notifications.js`, title "New message"), `sendNewMessageEmail` (`src/shared/lib/email.js`).
- Approx string budget: ~30-50.

### 24. Activity
Route: `/dashboard/agency/activity` (`App.jsx:173`).
- Entry: `client/src/domains/agency/pages/ActivityPage.jsx`/`.css`.
- API: `getAgencyActivity` (`agency.js`) → `src/domains/agency/routes/activity.js`, logging helper `src/domains/agency/routes/agency-log-activity.js`.
- Approx string budget: ~30-40.

### 25. Exports: shortlist share, CSV export, webhooks
- Shortlist share = event pick lists (Group 20): service `src/domains/agency/services/event-pick-lists.js`, public page `client/src/domains/events/pages/PickListPage.jsx`, route `src/domains/events/routes/pick-share.js`.
- CSV export: `GET /api/agency/export` in `src/domains/agency/routes/inbox.js` (~L3167-3620) — column headers and formatting are inline in this file (`csvColumns`), triggered from ApplicantsPage export action.
- Webhooks: config UI `client/src/domains/agency/pages/settings/ExportWebhookPanel.jsx` (+ test) → `src/domains/agency/routes/export-webhook.js`, dispatch/payload logic `src/domains/agency/services/export-webhook-dispatch.js` (field selection via `src/domains/agency/services/discover/field-whitelist.js`, applicant identity shaping `src/domains/agency/services/applicant-identity.js`).
- Approx string budget: ~40-60 (webhook panel copy, CSV headers).

### 26. Internal agency requests page
Route: `/internal/agency-requests` (`App.jsx:120-121`, `/internal` redirects here). Staff-only, independent auth.
- Entry: `client/src/domains/internal/pages/AgencyRequestsPage.jsx`/`.css`.
- API: `client/src/domains/internal/api/internal.js` → `src/domains/internal/routes/agency-requests.js` (mounted at app root, `src/app.js:893`), `src/domains/internal/middleware/*` for staff auth, `src/domains/internal/services/*`. Related: `src/domains/internal/routes/event-funnel.js` (mounted `src/app.js:895`, no dedicated page found — likely API-only/internal tooling).
- Agency access-request emails: `sendWelcomeAgencyEmail`, `sendAgencyActivationEmail` (`src/shared/lib/email.js`).
- Approx string budget: ~30-50.

---

## CROSS-CUTTING

### 27. Email templates
Core lib: `src/shared/lib/email.js` (all `sendEmail`/`send*Email` wrappers — **this is the single source of truth for subject lines**, template bodies imported from `src/shared/lib/pholio-email/`). Template modules: `templates.js` (barrel), `templates-talent.js`, `templates-submissions.js`, `templates-guardian.js`, `templates-agency.js`, `templates-opencall.js` (used separately by opencall receipt), `templates-materials.js`, `blocks.js`, `components.js`, `primitives.js`, `footer.js`, `tokens.js`, `tokens-agency.js`, `urls.js`, `text.js` (plain-text variants).

Subjects found in `email.js` / callers (exhaustive per grep):
- `Representation offer from ${agencyName}` / `Representation confirmed by ${agencyName}` / `Application update from ${agencyName}` / fallback `Application update` (`sendApplicationStatusEmail`)
- `New message from ${senderName}` (`sendNewMessageEmail`)
- `${agencyName} has invited you to apply on Pholio` (`sendAgencyInviteEmail`)
- `Welcome to Pholio` (`sendWelcomeTalentEmail`)
- `Welcome to Pholio — ${agencyName}` (`sendWelcomeAgencyEmail`)
- `${agencyName || "Your agency"} is approved for Pholio` (`sendAgencyActivationEmail`)
- `Verify your email address` (`sendEmailVerificationEmail`)
- `Reset your Pholio password` (`sendPasswordResetEmail`)
- `How to sign in to Pholio` (`sendSignInMethodNoticeEmail`)
- `Your Pholio password was changed` (`sendPasswordChangedEmail`)
- `You've been invited to ${agencyName} on Pholio` (`sendTeamInviteEmail`)
- guardian consent subject built conditionally (`sendGuardianConsentEmail`, ~L430)
- `New sign-in on ${device || "a new device"}` (`sendNewDeviceSignInEmail`)
- `Your card was declined` (`sendCardDeclinedEmail`)
- `${agencyName || "An agency"} asked for more` (`sendMaterialsRequestedEmail`)
- `Your Studio+ trial ends ${trialEndLabel || "soon"} — then ${priceLabel || "$9.99/month"}` (`sendTrialEndingEmail`)
- `${talentName || "An applicant"} confirmed their slot${eventName ? ` — ${eventName}` : ""}` (`sendEventSlotConfirmedEmail`)
- `${talentName || "An applicant"} declined their slot${eventName ? ` — ${eventName}` : ""}` (`sendEventSlotDeclinedEmail`)
- `${a} kept your book on file` (`templates-submissions.js:38`)
- Open-call applicant receipt: `OPEN_CALL_RECEIPT_SUBJECT` constant, `src/domains/opencall/services/emails.js:69`
- Shortlist/materials-requested (agency-triggered): `${agencyName} shortlisted you — a few more things`, `src/domains/agency/routes/materials.js:505`
- Billing notices: `src/shared/services/billing-notices.js` (dunning/trial notices, calls into `email.js` senders above)

Other sendMail callers: `src/domains/auth/services/email-verification.js`, `src/domains/opencall/services/emails.js`. Total distinct email flows: ~22 (auth ×6, talent app-lifecycle ×5, agency ×5, events/slots ×2, billing ×2, guardian ×1, materials ×1). Approx visible-string budget: ~120-160 (subjects + body copy blocks across templates).

### 28. In-app notifications (title/body writers)
Primary writer: `src/shared/services/notifications.js` — exports `NOTIFICATION_TYPES` enum and a large inline title map (talent-facing, ~L250-380): "Application received", "You're in the casting pool", "You've been offered a slot", "Slot confirmed", "Slot declined", "Kept on file", "Slot offer expired", "Casting closed — no response", "Application under review", "You were shortlisted", "More materials requested", "Meeting requested", "Development offer", "Representation offer", "Representation confirmed", "Application closed", "Application closed — no response", "Application archived", "Application updated", "Application submitted" (L412), plus dynamic titles: `${name} viewed your profile`, `${name} invited you to apply`, "Profile no longer submission-ready", `${name} sent you a message`.
- Agency-facing writer: `src/shared/services/agency-notifications.js` — "New application received" / body `${name} submitted to your agency.`; "Application withdrawn" / `${name} withdrew their application.`; "New message" / `${name} replied${snippet}`; plus `notifyAgencyEventSlotResponse` (~L182, dynamic body).
- Supporting/derived notifiers: `src/shared/services/notify-talent-application.js`, `src/shared/services/notify-profile-readiness.js` (drives "Profile no longer submission-ready").
- Read/write API surfaces: `src/domains/talent/routes/notifications.js`, `src/domains/agency/routes/notifications.js`.
- Client rendering/labels: `client/src/shared/components/NotificationCenter/*` (Group 3), agency `components/nav/NotificationsDropdown.jsx`.
- Talent notification preference gating (opt-out categories): `talentNotificationPrefEnabled()` in `notifications.js` (`profileViews`, `applicationUpdates` keys).
- Approx string budget: ~35-45 distinct title/body templates.

### 29. Wallet pass (`src/domains/wallet`)
- Route: `src/domains/wallet/routes/talent-wallet.js` (mounted `/api/talent/wallet`), triggered from `client/src/domains/talent/components/CompCard.jsx` (`<a href="/api/talent/wallet/pass">`, "Add to Apple Wallet" badge image).
- Builder pipeline: `services/pass-builder.js` (assembles `pass.json`), `services/pass-content.js` (**all field labels live here**: `REPRESENTATION`, `BOOKINGS`, `MOTHER AGENCY`, `PLACEMENT`, `HEIGHT`, `PORTFOLIO`, `MEASUREMENTS UPDATED`, `ISSUED`, `ABOUT THIS PASS` (long description string, ~L266), `PHOLIO`/support field; also "Seeking representation", "Direct" fallback values), `services/pass-artwork.js` (visual), `services/pass-bundle.js` (`.pkpass` zip assembly), `services/pass-config.js`, `services/face-locator.js` (crop logic, no copy).
- Wallet preview docs (not to be read per instructions, but files exist): `docs/wallet/previews/*` — excluded from this audit per scope (docs/ is not excluded generally, only docs/audits and docs/*audit*, but wallet previews are image assets, not code — noted for completeness only, not read).
- Generated artifact: Apple Wallet `.pkpass` file.
- Approx string budget: ~15-20 field labels + 1 long description string.

### 30. Spec-registry export (README/STATS/EMAIL) and preflight labels
- Export service: `src/domains/spec-registry/export/spec-export-service.js` — generates `README.txt` (via `renderReadme()`, ~L362), `STATS.txt` (via `renderStatsFile()`, ~L343, filename const `STATS_FILENAME`), `EMAIL.txt` (filename const `EMAIL_FILENAME`, draft body via `src/domains/spec-registry/export/email-draft.js`), zipped by `src/domains/spec-registry/export/zip.js`, plan/manifest shaping in `export-plan.js`, stats numbers formatted by `stats-block.js`.
- Authoring UI producing the spec: `client/src/domains/agency/pages/settings/SpecBuilderPanel.jsx`/`.css` (+ test) → `src/domains/agency/routes/spec-builder.js` → `src/domains/spec-registry/authoring/spec-builder-service.js`, `authorable-fields.js`, `compose.js`, `validate-authored.js`.
- Preflight labels (talent-facing "does my package match this agency's spec" banner): `src/domains/spec-registry/preflight-service.js` — dynamic sentences e.g. `Your current package has no confirmed match for "${label}".`, `The agency publishes "${label}" as guidance...`, plus quick-action labels "Open the book", "Open profile", "View agency source"; rendered by `client/src/domains/talent/components/RegistryPreflight.jsx`/`.module.css` (+ test).
- Taxonomy label source shared by both: `src/domains/spec-registry/taxonomy-labels.js` (`registryTaxonomyLabels()`), also referenced client-side via `client/src/domains/talent/lib/specRegistry.js`-style readers (`readRoutes`, `readVerificationNotice` imported in ApplyExperience).
- Store/validation (no direct copy but structural): `store/*`, `validation/registry-validator.js`, `public-projection.js`, `matcher.js`, `matcher-input.js`, `engagement-service.js`.
- Generated artifacts: ZIP bundle containing README.txt, STATS.txt, EMAIL.txt, plus encoded images.
- Approx string budget: ~40-60 (README/STATS/EMAIL boilerplate + preflight sentence templates).

### 31. Shared constants and label maps
Server (`src/shared/constants/`): `application-status.js`, `booking-lanes.js`, `event-casting.js`, `frame-taxonomy.js`, `open-call-intake.js`, `package-intelligence.js`, `profile-division.js`, `submission-tracker.js`.
Client mirrors (`client/src/shared/constants/`): `applicationStatus.js`, `bookingLanes.js`, `eventCasting.js`, `frameTaxonomy.js` (label-heavy — `SHOT_LABELS`, `IMAGE_TYPE_LABELS`, `FRAME_TYPE_OPTIONS` with `label`/`hint` pairs), `openCallIntake.js`, `packageIntelligence.js`, `profileDivision.js`, `statsTrack.js`, `submissionTracker.js`, `talentNav.js`.
Domain-local label/taxonomy files (not under the shared constants dir but functioning as label maps): `client/src/domains/agency/components/status/statusConfig.js` (application-stage labels: Submitted/Reviewing/Shortlisted/Offered/Represented/New Face/Passed/Archived; availability labels: Available/On Booking/1st Option/2nd Option/On Hold/Booked), `client/src/domains/agency/components/status/divisions.js` (+ test), `client/src/shared/components/frame/reviewStateLabel.js`, `client/src/domains/talent/utils/applicationStatus.js` (`statusConfig()`), `client/src/domains/talent/utils/representationStatus.js`, `client/src/domains/agency/components/meta/metaFormat.js` (+ test — unit/measurement formatting, not translation but affects displayed strings), `src/domains/spec-registry/taxonomy-labels.js`.
Approx string budget: ~200-300 label/enum entries across all constant files combined.

### 32. Server error/validation message sources reaching the UI
- Central error handler: `src/shared/middleware/error-handler.js` (`renderErrorPage`, `wantsJsonError`, `isApiRequest`) — wraps thrown errors into `{success:false, error:{message, code, details, errors}}` for API/JSON, or renders `views/errors/{403,404,422,500}.ejs` for non-API browser requests. Error reporting sink (not user-visible): `src/shared/lib/error-reporting.js`.
- Shared validation/schema libs: `src/shared/lib/validation.js` (1912 lines — largest single validation-message source in the repo), `src/shared/lib/schemas.js`.
- Zod schema usage sites (route-level input validation, each can produce field-level messages): `src/domains/agency/routes/inbox.js`, `src/domains/agency/routes/team-rbac.js`, `src/domains/talent/routes/profile.js`, `src/domains/talent/routes/representations.js`, `src/domains/talent/services/representations.js`.
- Route-level `res.status(4xx).json({message: ...})` hot spots worth auditor attention (files, not exhaustive strings): `src/domains/onboarding/routes/casting.js` (many inline messages, birthdate/verification/consent flow), `src/domains/auth/routes/auth.js`, `src/domains/moderation/routes/reports.js`, `src/domains/agency/routes/inbox.js`, `src/domains/talent/routes/*.js` (all route files), `src/domains/opencall/routes/*.js`, `src/domains/wallet/routes/talent-wallet.js`.
- Client-side surfacing helpers: `client/src/shared/lib/api-error-message.js` (`parseApiFailure` — normalizes server error payloads for toast/inline display), `client/src/shared/components/states/*` (`TransferFailureNotice`, `EmptyErrorState`), `client/src/shared/components/ErrorBoundary.jsx`.
- Approx string budget: not a fixed count — this is a *source inventory*; hundreds of inline `message:` literals exist across the ~60 route files enumerated above. Recommend per-route-file sampling rather than full enumeration.

### 33. Toasts (sonner) call sites — summary by domain
Grep of `from 'sonner'` importers across `client/src`:
- `domains/agency`: 26 files (heaviest — inbox actions, decline flow, team, settings panels, casting board actions)
- `domains/talent`: 18 files (Settings page is the single biggest contributor — ~20+ toast calls in `SettingsPage/index.jsx` alone: "Unable to save settings", "Public handle updated", "Identity saved", "Unable to copy link", "Primary image updated", "Presence updated", "Signal preference saved", "Studio+ is being activated", "Unable to open billing", "Device signed out", "Signed out N devices"/"No other devices were signed in", "Reset link sent to ...", "Setting saved", "Data export downloaded", "Agreements acknowledged", "Account paused", "Account deleted", plus generic `error?.message ||` fallbacks throughout)
- `domains/onboarding`: 2 files
- `domains/opencall`: 1 file
- `domains/moderation`: 1 file
- `domains/events`: 1 file
- `domains/messaging`: 1 file
- `shared`: 3 files (cross-cutting toast helpers, incl. `client/src/shared/lib/pholio-toast.js` used by Media/Applications pages)
Total files using `sonner`: 53. Approx string budget: ~150-200 distinct toast messages app-wide (success/error pairs per mutation, many with `error?.message || 'fallback text'` pattern — the fallback text is the audit-relevant literal).

### 34. Push notifications
None found. Repo-wide search for web-push/APNs/FCM/service-worker push patterns returned no matches. The only "push"-adjacent surface is the Apple Wallet pass (Group 29, which is a static pass file, not a push channel) and in-app notifications (Group 28) plus email (Group 27). No push notification generator exists in this codebase as of this scan.

---

## Methodology notes for auditors
- Route table source of truth: `client/src/App.jsx` (single file, ~180 lines, defines every client route).
- Server route mounting source of truth: `src/app.js` (top-level `app.use(...)` calls) plus each domain's `routes/index.js` (`src/domains/talent/routes/index.js`, `src/domains/agency/routes/index.js`) for prefix-level detail.
- Files explicitly NOT read per instructions: `.claude/skills/*`, `docs/audits/*`, `tasks/*`, `docs/*audit*` (e.g. `docs/comp-card-audit-2026-07/`). These may contain prior audit findings but were intentionally excluded from this scan.
- String counts throughout are grep-based estimates on quoted literals in `.jsx` files per domain; they are not a substitute for a literal-by-literal pass and over-count (class names, test ids, non-visible constants included). Use them only for relative budgeting between surfaces, not as a target count.
