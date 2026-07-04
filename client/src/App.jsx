import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import PholioAuthBridge from './shared/lib/pholio-auth/PholioAuthBridge';
import DashboardLayoutShell from './shared/layouts/DashboardLayoutShell';
import AuthLayout from './shared/layouts/AuthLayout';
import AgencyLayout from './shared/layouts/AgencyLayout';
import AgencySessionGate from './domains/agency/components/AgencySessionGate';
import CookieConsentBanner from './shared/components/CookieConsentBanner';
import LoadingSpinner from './shared/components/shared/LoadingSpinner';

const LoginPage = lazy(() => import('./domains/auth/pages/LoginPage/LoginPage'));
const InstagramCallbackPage = lazy(() => import('./domains/auth/pages/InstagramCallbackPage'));
const OverviewPage = lazy(() => import('./domains/talent/pages/OverviewPage'));
const ProfilePage = lazy(() => import('./domains/talent/pages/ProfilePage'));
const MediaPage = lazy(() => import('./domains/talent/pages/MediaPage'));
const IntelPage = lazy(() => import('./domains/talent/pages/IntelPage'));
const ApplicationsPage = lazy(() => import('./domains/talent/pages/ApplicationsPage'));
const MessagesPage = lazy(() => import('./domains/talent/pages/MessagesPage'));
const ApplyPage = lazy(() => import('./domains/talent/pages/ApplyPage'));
const RevealPage = lazy(() => import('./domains/talent/pages/RevealPage'));

const SettingsPage = lazy(() => import('./domains/talent/pages/SettingsPage'));
const CastingCallPage = lazy(() => import('./domains/onboarding/pages/CastingCallPage'));
const TestPreview = lazy(() => import('./domains/onboarding/pages/TestPreview'));
const OpenCallArrivalPage = lazy(() => import('./domains/onboarding/pages/OpenCallArrivalPage'));

// Agency pages
const AgencyOverview = lazy(() => import('./domains/agency/pages/OverviewPage'));
const AgencyApplicants = lazy(() => import('./domains/agency/pages/ApplicantsPage'));
const AgencyDiscover = lazy(() => import('./domains/agency/pages/DiscoverPage'));
const AgencyBoards = lazy(() => import('./domains/agency/pages/BoardsPage'));
const AgencyAnalytics = lazy(() => import('./domains/agency/pages/AnalyticsPage'));
const AgencySettings = lazy(() => import('./domains/agency/pages/SettingsPage'));
const AgencyCasting = lazy(() => import('./domains/agency/pages/CastingPage'));
const AgencyCastingDetail = lazy(() => import('./domains/agency/pages/CastingDetailPage'));
const AgencyRoster = lazy(() => import('./domains/agency/pages/RosterPage'));
const AgencyMessages = lazy(() => import('./domains/agency/pages/MessagesPage'));
const AgencyActivity = lazy(() => import('./domains/agency/pages/ActivityPage'));
const AgencyInterviews = lazy(() => import('./domains/agency/pages/InterviewsPage'));
const AgencyTeam = lazy(() => import('./domains/agency/pages/TeamPage'));
const AgencyReminders = lazy(() => import('./domains/agency/pages/RemindersPage'));
const AgencySigned = lazy(() => import('./domains/agency/pages/SignedPage'));
const AgencyTalentView = lazy(() => import('./domains/agency/pages/TalentFullView'));
const ReplyPage = lazy(() => import('./domains/messaging/pages/ReplyPage'));
const AuthEntrySplashPreview = lazy(() => import('./domains/auth/pages/AuthEntrySplashPreview'));
const ModerationQueuePage = lazy(() => import('./domains/moderation/pages/ModerationQueuePage'));
const MockConsentPage = lazy(() => import('./domains/talent/pages/ProfilePage/MockConsentPage'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-[#faf9f7]">
      <LoadingSpinner size="lg" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <PholioAuthBridge />
      <CookieConsentBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Root redirects */}
          <Route path="/" element={<Navigate to="/dashboard/talent" replace />} />
          <Route path="/messages" element={<Navigate to="/dashboard/agency/messages" replace />} />
          <Route path="/activity" element={<Navigate to="/dashboard/agency/activity" replace />} />

          {/* Onboarding - Standalone (no dashboard layout) */}
          <Route path="/onboarding" element={<CastingCallPage />} />
          <Route path="/apply" element={<Navigate to="/onboarding" replace />} />
          <Route path="/onboarding/test" element={<TestPreview />} />

          {/* Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          {import.meta.env.DEV ? (
            <Route path="/dev/preview/auth-entry" element={<AuthEntrySplashPreview />} />
          ) : null}
          <Route path="/auth/instagram/callback" element={<InstagramCallbackPage />} />
          {import.meta.env.DEV ? (
            <Route path="/socials/oauth/mock/:platform" element={<MockConsentPage />} />
          ) : null}

          {/* Magic-link message reply (standalone, no login wall) */}
          <Route path="/reply/:token" element={<ReplyPage />} />

          {/* Standalone Reveal */}
          <Route path="/reveal" element={<RevealPage />} />
          <Route path="/dashboard/talent/reveal" element={<RevealPage />} />

          {/* Agency open call arrival — standalone, pre-auth */}
          <Route path="/opencall/:code" element={<OpenCallArrivalPage />} />

          {/* Standalone full-screen submission studio (no dashboard chrome) */}
          <Route path="/dashboard/talent/applications/apply" element={<ApplyPage />} />

          {/* Talent Dashboard Routes */}
          <Route element={<DashboardLayoutShell />}>
            <Route path="/dashboard/talent" element={<OverviewPage />} />
            <Route path="/dashboard/talent/profile" element={<ProfilePage />} />
            <Route path="/dashboard/talent/media" element={<MediaPage />} />
            <Route path="/dashboard/talent/analytics" element={<IntelPage />} />
            <Route path="/dashboard/talent/applications" element={<ApplicationsPage />} />
            <Route path="/dashboard/talent/messages" element={<MessagesPage />} />
            <Route path="/dashboard/talent/settings" element={<SettingsPage />} />
            <Route path="/dashboard/talent/settings/:section" element={<SettingsPage />} />
            <Route path="/dashboard/moderation" element={<ModerationQueuePage />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/talent" replace />} />
          </Route>

          {/* Agency Dashboard Routes */}
          <Route path="/agency" element={<Navigate to="/dashboard/agency" replace />} />
          <Route element={<AgencySessionGate />}>
            <Route path="/dashboard/agency/onboarding" element={<Navigate to="/dashboard/agency" replace />} />
            <Route element={<AgencyLayout />}>
              <Route path="/dashboard/agency" element={<AgencyOverview />} />
              <Route path="/dashboard/agency/overview" element={<Navigate to="/dashboard/agency" replace />} />
              <Route path="/dashboard/agency/inbox" element={<Navigate to="/dashboard/agency/applicants" replace />} />
              <Route path="/dashboard/agency/applicants" element={<AgencyApplicants />} />
              <Route path="/dashboard/agency/casting" element={<AgencyCasting />} />
              <Route path="/dashboard/agency/casting/:boardId" element={<AgencyCastingDetail />} />
              <Route path="/dashboard/agency/discover" element={<AgencyDiscover />} />
              <Route path="/dashboard/agency/boards" element={<AgencyBoards />} />
              <Route path="/dashboard/agency/roster" element={<AgencyRoster />} />
              <Route path="/dashboard/agency/signed" element={<AgencySigned />} />
              <Route path="/dashboard/agency/interviews" element={<AgencyInterviews />} />
              <Route path="/dashboard/agency/reminders" element={<AgencyReminders />} />
              <Route path="/dashboard/agency/analytics" element={<AgencyAnalytics />} />
              <Route path="/dashboard/agency/settings" element={<AgencySettings />} />
              <Route path="/dashboard/agency/team" element={<AgencyTeam />} />
              <Route path="/dashboard/agency/talent/:applicationId" element={<AgencyTalentView />} />
              <Route path="/dashboard/agency/messages" element={<AgencyMessages />} />
              <Route path="/dashboard/agency/activity" element={<AgencyActivity />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
