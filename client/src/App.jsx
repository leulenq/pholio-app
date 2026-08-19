import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import PholioAuthBridge from './shared/lib/pholio-auth/PholioAuthBridge';
import DashboardLayoutShell from './shared/layouts/DashboardLayoutShell';
import AuthLayout from './shared/layouts/AuthLayout';
import AgencyLayout from './shared/layouts/AgencyLayout';
import AgencySessionGate from './domains/agency/components/AgencySessionGate';
import CookieConsentBanner from './shared/components/CookieConsentBanner';
import PageLoadingScreen from './shared/components/shared/PageLoadingScreen';

const LoginPage = lazy(() => import('./domains/auth/pages/LoginPage/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./domains/auth/pages/ForgotPasswordPage/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./domains/auth/pages/ResetPasswordPage/ResetPasswordPage'));
const InstagramCallbackPage = lazy(() => import('./domains/auth/pages/InstagramCallbackPage'));
const OverviewPage = lazy(() => import('./domains/talent/pages/OverviewPage'));
const ProfilePage = lazy(() => import('./domains/talent/pages/ProfilePage'));
const MediaPage = lazy(() => import('./domains/talent/pages/MediaPage'));
const ApplicationsPage = lazy(() => import('./domains/talent/pages/ApplicationsPage'));
const IntelPage = lazy(() => import('./domains/talent/pages/IntelPage'));
const MessagesPage = lazy(() => import('./domains/talent/pages/MessagesPage'));
const ApplyPage = lazy(() => import('./domains/talent/pages/ApplyPage'));

const SettingsPage = lazy(() => import('./domains/talent/pages/SettingsPage'));
const CastingCallPage = lazy(() => import('./domains/onboarding/pages/CastingCallPage'));
const TestPreview = lazy(() => import('./domains/onboarding/pages/TestPreview'));
const OpenCallArrivalPage = lazy(() => import('./domains/onboarding/pages/OpenCallArrivalPage'));

// Agency pages
const AgencyOverview = lazy(() => import('./domains/agency/pages/OverviewPage'));
const AgencyApplicants = lazy(() => import('./domains/agency/pages/ApplicantsPage'));
const AgencyDiscover = lazy(() => import('./domains/agency/pages/DiscoverPage'));
const AgencyEvents = lazy(() => import('./domains/agency/pages/EventsPage'));
const AgencyEventCall = lazy(() => import('./domains/agency/pages/EventCallPage'));
const AgencySettings = lazy(() => import('./domains/agency/pages/SettingsPage'));
const AgencyCasting = lazy(() => import('./domains/agency/pages/CastingPage'));
const AgencyCastingDetail = lazy(() => import('./domains/agency/pages/CastingDetailPage'));
const AgencyMessages = lazy(() => import('./domains/agency/pages/MessagesPage'));
const AgencyActivity = lazy(() => import('./domains/agency/pages/ActivityPage'));
const AgencyTeam = lazy(() => import('./domains/agency/pages/TeamPage'));
const AgencySetup = lazy(() => import('./domains/agency/pages/SetupPage'));
const AgencyTalentView = lazy(() => import('./domains/agency/pages/TalentFullView'));
const ReplyPage = lazy(() => import('./domains/messaging/pages/ReplyPage'));
const PickListPage = lazy(() => import('./domains/events/pages/PickListPage'));
const AuthEntrySplashPreview = lazy(() => import('./domains/auth/pages/AuthEntrySplashPreview'));
const ModerationQueuePage = lazy(() => import('./domains/moderation/pages/ModerationQueuePage'));
const MockConsentPage = lazy(() => import('./domains/talent/pages/ProfilePage/MockConsentPage'));
const InternalAgencyRequests = lazy(() => import('./domains/internal/pages/AgencyRequestsPage'));

function RouteFallback() {
  return <PageLoadingScreen />;
}

function LegacyAgencySigningRedirect() {
  const { boardId } = useParams();
  const target = boardId
    ? `/dashboard/agency/signing/${encodeURIComponent(boardId)}`
    : '/dashboard/agency/signing';
  return <Navigate to={target} replace />;
}

function App() {
  return (
    <ErrorBoundary boundary="app-root">
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
            <Route path="/login/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
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

          {/* Designer pick list (standalone, token only — designers have no account) */}
          <Route path="/picks/:token" element={<PickListPage />} />

          {/* The post-onboarding reveal is gone; old links land on the dashboard. */}
          <Route path="/reveal" element={<Navigate to="/dashboard/talent" replace />} />
          <Route
            path="/dashboard/talent/reveal"
            element={<Navigate to="/dashboard/talent" replace />}
          />

          {/* Agency open call arrival — standalone, pre-auth */}
          <Route path="/opencall/:code" element={<OpenCallArrivalPage />} />

          {/* Platform staff review — API authorization is independent of product roles. */}
          <Route path="/internal" element={<Navigate to="/internal/agency-requests" replace />} />
          <Route path="/internal/agency-requests" element={<InternalAgencyRequests />} />

          {/* Standalone full-screen submission studio (no dashboard chrome) */}
          <Route path="/dashboard/talent/applications/apply" element={<ApplyPage />} />

          {/* Talent Dashboard Routes */}
          <Route element={<DashboardLayoutShell />}>
            <Route path="/dashboard/talent" element={<OverviewPage />} />
            <Route path="/dashboard/talent/profile" element={<ProfilePage />} />
            <Route path="/dashboard/talent/media" element={<MediaPage />} />
            <Route path="/dashboard/talent/analytics" element={<Navigate to="/dashboard/talent/intel" replace />} />
            <Route path="/dashboard/talent/intel" element={<IntelPage />} />
            <Route path="/dashboard/talent/applications" element={<ApplicationsPage />} />
            {/* The standalone requirements page is gone: published requirements
                now read inside the apply workspace, against the same route the
                talent is actually preparing for. Kept as a redirect so saved
                links land on the market rather than a 404. */}
            <Route
              path="/dashboard/talent/applications/requirements"
              element={<Navigate to="/dashboard/talent/applications" replace />}
            />
            <Route path="/dashboard/talent/messages" element={<MessagesPage />} />
            <Route path="/dashboard/talent/settings" element={<SettingsPage />} />
            <Route path="/dashboard/talent/settings/:section" element={<SettingsPage />} />
            <Route path="/dashboard/moderation" element={<ModerationQueuePage />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/talent" replace />} />
          </Route>

          {/* Agency Dashboard Routes */}
          <Route path="/agency" element={<Navigate to="/dashboard/agency" replace />} />
          <Route element={<AgencySessionGate />}>
            <Route path="/dashboard/agency/onboarding" element={<Navigate to="/dashboard/agency/setup" replace />} />
            <Route path="/dashboard/agency/setup" element={<AgencySetup />} />
            <Route element={<AgencyLayout />}>
              <Route path="/dashboard/agency" element={<AgencyOverview />} />
              <Route path="/dashboard/agency/overview" element={<Navigate to="/dashboard/agency" replace />} />
              <Route path="/dashboard/agency/submissions" element={<AgencyApplicants />} />
              <Route path="/dashboard/agency/inbox" element={<Navigate to="/dashboard/agency/submissions" replace />} />
              <Route path="/dashboard/agency/applicants" element={<Navigate to="/dashboard/agency/submissions" replace />} />
              <Route path="/dashboard/agency/signing" element={<AgencyCasting />} />
              <Route path="/dashboard/agency/signing/:boardId" element={<AgencyCastingDetail />} />
              <Route path="/dashboard/agency/casting" element={<LegacyAgencySigningRedirect />} />
              <Route path="/dashboard/agency/casting/:boardId" element={<LegacyAgencySigningRedirect />} />
              <Route path="/dashboard/agency/discover" element={<AgencyDiscover />} />
              <Route path="/dashboard/agency/events" element={<AgencyEvents />} />
              <Route path="/dashboard/agency/events/:linkId" element={<AgencyEventCall />} />
              <Route path="/dashboard/agency/roster" element={<Navigate to="/dashboard/agency/submissions" replace />} />
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
