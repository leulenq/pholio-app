import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import DashboardLayoutShell from './layouts/DashboardLayoutShell';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './routes/auth/LoginPage';
import AgencyLayout from './layouts/AgencyLayout';
import DashboardPage from './routes/DashboardPage';
import ProfilePage from './routes/talent/ProfilePage';
import MediaPage from './routes/talent/MediaPage';
import AnalyticsPage from './routes/talent/AnalyticsPage';
import ApplicationsPage from './routes/talent/ApplicationsPage';
import RevealPage from './routes/talent/RevealPage';

import DashboardPricingPage from './routes/PricingPage';
import SettingsPage from './routes/SettingsPage';
import CastingCallPage from './routes/onboarding/CastingCallPage';
import CastingRevealPreview from './routes/onboarding/CastingRevealPreview';
import TestPreview from './routes/onboarding/TestPreview';

// Agency pages
import AgencyOverview from './routes/agency/OverviewPage';
import AgencyApplicants from './routes/agency/ApplicantsPage';
import AgencyDiscover from './routes/agency/DiscoverPage';
import AgencyBoards from './routes/agency/BoardsPage';
import AgencyAnalytics from './routes/agency/AnalyticsPage';
import AgencySettings from './routes/agency/SettingsPage';
import AgencyInterviews from './routes/agency/InterviewsPage';
import AgencyReminders from './routes/agency/RemindersPage';
import AgencySigned from './routes/agency/SignedPage';
import AgencyCasting from './routes/agency/CastingPage';
import AgencyRoster from './routes/agency/RosterPage';
import AgencyMessages from './routes/agency/MessagesPage';
import AgencyActivity from './routes/agency/ActivityPage';

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
          <Route path="/pricing" element={<DashboardPricingPage />} />
          <Route path="/dashboard" element={<Navigate to="/dashboard/talent" replace />} />
        </Route>

        {/* Agency Dashboard Routes */}
        <Route path="/agency" element={<Navigate to="/dashboard/agency" replace />} />
        <Route element={<AgencyLayout />}>
          <Route path="/dashboard/agency" element={<AgencyOverview />} />
          <Route path="/dashboard/agency/casting" element={<AgencyCasting />} />
          <Route path="/dashboard/agency/applicants" element={<AgencyApplicants />} />
          <Route path="/dashboard/agency/discover" element={<AgencyDiscover />} />
          <Route path="/dashboard/agency/boards" element={<AgencyBoards />} />
          <Route path="/dashboard/agency/signed" element={<AgencySigned />} />
          <Route path="/dashboard/agency/roster" element={<AgencyRoster />} />
          <Route path="/dashboard/agency/interviews" element={<AgencyInterviews />} />
          <Route path="/dashboard/agency/reminders" element={<AgencyReminders />} />
          <Route path="/dashboard/agency/analytics" element={<AgencyAnalytics />} />
          <Route path="/dashboard/agency/settings" element={<AgencySettings />} />
          <Route path="/dashboard/agency/messages" element={<AgencyMessages />} />
          <Route path="/dashboard/agency/activity" element={<AgencyActivity />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
