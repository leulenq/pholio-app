import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import DashboardLayoutShell from './shared/layouts/DashboardLayoutShell';
import AuthLayout from './shared/layouts/AuthLayout';
import LoginPage from './domains/auth/pages/LoginPage/LoginPage';
import AgencyLayout from './shared/layouts/AgencyLayout';
import AgencySessionGate from './domains/agency/components/AgencySessionGate';
import DashboardPage from './domains/talent/pages/DashboardPage';
import ProfilePage from './domains/talent/pages/ProfilePage';
import MediaPage from './domains/talent/pages/MediaPage';
import AnalyticsPage from './domains/talent/pages/AnalyticsPage';
import ApplicationsPage from './domains/talent/pages/ApplicationsPage';
import RevealPage from './domains/talent/pages/RevealPage';

import SettingsPage from './domains/talent/pages/SettingsPage';
import CastingCallPage from './domains/onboarding/pages/CastingCallPage';
import CastingRevealPreview from './domains/onboarding/pages/CastingRevealPreview';
import TestPreview from './domains/onboarding/pages/TestPreview';

// Agency pages
import AgencyInbox from './domains/agency/pages/InboxPage';
import AgencyOverview from './domains/agency/pages/OverviewPage';
import AgencyOnboarding from './domains/onboarding/pages/AgencyOnboardingPage';
import AgencyDiscover from './domains/agency/pages/DiscoverPage';
import AgencyBoards from './domains/agency/pages/BoardsPage';
import AgencyAnalytics from './domains/agency/pages/AnalyticsPage';
import AgencySettings from './domains/agency/pages/SettingsPage';
import AgencyCasting from './domains/agency/pages/CastingPage';
import AgencyRoster from './domains/agency/pages/RosterPage';
import AgencyMessages from './domains/agency/pages/MessagesPage';
import AgencyActivity from './domains/agency/pages/ActivityPage';

// Placeholder pages
const PdfCustomizerPage = () => <div>PDF Customizer Page</div>;

function App() {
  return (
    <ErrorBoundary>
      <Toaster richColors position="top-right" />
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

        {/* Standalone Reveal */}
        <Route path="/reveal" element={<RevealPage />} />
        <Route path="/dashboard/talent/reveal" element={<RevealPage />} />

        {/* Talent Dashboard Routes */}
        <Route element={<DashboardLayoutShell />}>
          <Route path="/dashboard/talent" element={<DashboardPage />} />
          <Route path="/dashboard/talent/profile" element={<ProfilePage />} />
          <Route path="/dashboard/talent/media" element={<MediaPage />} />
          <Route path="/dashboard/talent/analytics" element={<AnalyticsPage />} />
          <Route path="/dashboard/talent/applications" element={<ApplicationsPage />} />
          <Route path="/dashboard/talent/settings" element={<SettingsPage />} />
          <Route path="/dashboard/talent/settings/:section" element={<SettingsPage />} />
          <Route path="/dashboard/talent/pdf-customizer" element={<PdfCustomizerPage />} />
          <Route path="/dashboard" element={<Navigate to="/dashboard/talent" replace />} />
        </Route>

        {/* Agency Dashboard Routes */}
        <Route path="/agency" element={<Navigate to="/dashboard/agency" replace />} />
        <Route element={<AgencySessionGate />}>
          <Route path="/dashboard/agency/onboarding" element={<AgencyOnboarding />} />
          <Route element={<AgencyLayout />}>
            <Route path="/dashboard/agency" element={<Navigate to="/dashboard/agency/inbox" replace />} />
            <Route path="/dashboard/agency/inbox" element={<AgencyInbox />} />
            <Route path="/dashboard/agency/applicants" element={<Navigate to="/dashboard/agency/inbox" replace />} />
            <Route path="/dashboard/agency/overview" element={<AgencyOverview />} />
            <Route path="/dashboard/agency/casting" element={<AgencyCasting />} />
            <Route path="/dashboard/agency/discover" element={<AgencyDiscover />} />
            <Route path="/dashboard/agency/boards" element={<AgencyBoards />} />
            <Route path="/dashboard/agency/roster" element={<AgencyRoster />} />
            <Route path="/dashboard/agency/analytics" element={<AgencyAnalytics />} />
            <Route path="/dashboard/agency/settings" element={<AgencySettings />} />
            <Route path="/dashboard/agency/messages" element={<AgencyMessages />} />
            <Route path="/dashboard/agency/activity" element={<AgencyActivity />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
