import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import PholioAuthBridge from './shared/lib/pholio-auth/PholioAuthBridge';
import DashboardLayoutShell from './shared/layouts/DashboardLayoutShell';
import AuthLayout from './shared/layouts/AuthLayout';
import LoginPage from './domains/auth/pages/LoginPage/LoginPage';
import InstagramCallbackPage from './domains/auth/pages/InstagramCallbackPage';
import AgencyLayout from './shared/layouts/AgencyLayout';
import AgencySessionGate from './domains/agency/components/AgencySessionGate';
import OverviewPage from './domains/talent/pages/OverviewPage';
import ProfilePage from './domains/talent/pages/ProfilePage';
import MediaPage from './domains/talent/pages/MediaPage';
import AnalyticsPage from './domains/talent/pages/AnalyticsPage';
import ApplicationsPage from './domains/talent/pages/ApplicationsPage';
import ApplyPage from './domains/talent/pages/ApplyPage';
import RevealPage from './domains/talent/pages/RevealPage';

import SettingsPage from './domains/talent/pages/SettingsPage';
import CastingCallPage from './domains/onboarding/pages/CastingCallPage';
import CastingRevealPreview from './domains/onboarding/pages/CastingRevealPreview';
import TestPreview from './domains/onboarding/pages/TestPreview';

// Agency pages
import AgencyOverview from './domains/agency/pages/OverviewPage';
import AgencyApplicants from './domains/agency/pages/ApplicantsPage';
import AgencyDiscover from './domains/agency/pages/DiscoverPage';
import AgencyBoards from './domains/agency/pages/BoardsPage';
import AgencyAnalytics from './domains/agency/pages/AnalyticsPage';
import AgencySettings from './domains/agency/pages/SettingsPage';
import AgencyCasting from './domains/agency/pages/CastingPage';
import AgencyCastingDetail from './domains/agency/pages/CastingDetailPage';
import AgencyRoster from './domains/agency/pages/RosterPage';
import AgencyMessages from './domains/agency/pages/MessagesPage';
import AgencyActivity from './domains/agency/pages/ActivityPage';
import AgencyInterviews from './domains/agency/pages/InterviewsPage';
import AgencyTeam from './domains/agency/pages/TeamPage';
import AgencyReminders from './domains/agency/pages/RemindersPage';
import AgencySigned from './domains/agency/pages/SignedPage';
import AgencyTalentView from './domains/agency/pages/TalentFullView';
import ReplyPage from './domains/messaging/pages/ReplyPage';
import AuthEntrySplashPreview from './domains/auth/pages/AuthEntrySplashPreview';
import ModerationQueuePage from './domains/moderation/pages/ModerationQueuePage';
import CookieConsentBanner from './shared/components/CookieConsentBanner';

function App() {
  return (
    <ErrorBoundary>
      <PholioAuthBridge />
      <CookieConsentBanner />
      <Routes>
        {/* Root redirects */}
        <Route path="/" element={<Navigate to="/dashboard/talent" replace />} />
        <Route path="/messages" element={<Navigate to="/dashboard/agency/messages" replace />} />
        <Route path="/activity" element={<Navigate to="/dashboard/agency/activity" replace />} />

        {/* Onboarding - Standalone (no dashboard layout) */}
        <Route path="/onboarding" element={<CastingCallPage />} />
        <Route path="/apply" element={<Navigate to="/onboarding" replace />} />
        <Route path="/onboarding/test" element={<TestPreview />} />
        <Route path="/onboarding/preview-reveal" element={<CastingRevealPreview />} />

        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        {import.meta.env.DEV ? (
          <Route path="/dev/preview/auth-entry" element={<AuthEntrySplashPreview />} />
        ) : null}
        <Route path="/auth/instagram/callback" element={<InstagramCallbackPage />} />

        {/* Magic-link message reply (standalone, no login wall) */}
        <Route path="/reply/:token" element={<ReplyPage />} />

        {/* Standalone Reveal */}
        <Route path="/reveal" element={<RevealPage />} />
        <Route path="/dashboard/talent/reveal" element={<RevealPage />} />

        {/* Standalone full-screen submission studio (no dashboard chrome) */}
        <Route path="/dashboard/talent/applications/apply" element={<ApplyPage />} />

        {/* Talent Dashboard Routes */}
        <Route element={<DashboardLayoutShell />}>
          <Route path="/dashboard/talent" element={<OverviewPage />} />
          <Route path="/dashboard/talent/profile" element={<ProfilePage />} />
          <Route path="/dashboard/talent/media" element={<MediaPage />} />
          <Route path="/dashboard/talent/analytics" element={<AnalyticsPage />} />
          <Route path="/dashboard/talent/applications" element={<ApplicationsPage />} />
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
    </ErrorBoundary>
  );
}

export default App;
