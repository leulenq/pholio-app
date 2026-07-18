import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import LoadingSpinner from '../../../shared/components/shared/LoadingSpinner';
import AuthEntrySplash from '../../auth/components/AuthEntrySplash';
import {
  resolveAgencyEntryAvatar,
  resolveEntryDisplayName,
} from '../../auth/lib/entry-identity';
import { useAuthEntryTransition } from '../../auth/hooks/useAuthEntryTransition';
import { ensureDevDashboardSession } from '../../../shared/lib/dev-seed-session';
import { getAgencyLegalStatus, getAgencyProfile } from '../api/agency';
import { AgencyPermissionsProvider } from '../context/AgencyPermissionsProvider';
import AgencyLegalAcceptanceGate from './AgencyLegalAcceptanceGate';

export default function AgencySessionGate() {
  const location = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['session', 'agency'],
    queryFn: () => ensureDevDashboardSession('AGENCY'),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const isAgencySession = data?.authenticated && data?.role === 'AGENCY';
  const legalStatusQuery = useQuery({
    queryKey: ['agency', 'legal-status'],
    queryFn: getAgencyLegalStatus,
    retry: false,
    enabled: Boolean(isAgencySession),
  });
  const legalAccepted = legalStatusQuery.data?.needsAcceptance === false;
  const agencyProfileQuery = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(isAgencySession && legalAccepted),
  });
  const agencyProfile = agencyProfileQuery.data;
  const legalStatusSettled = !isAgencySession || !legalStatusQuery.isLoading;
  const profileSettled = !legalAccepted || !agencyProfileQuery.isLoading;
  const entryDataReady = !isLoading && legalStatusSettled && profileSettled;
  const { showEntrySplash, isEntrySplashExiting, entryStartedAt } = useAuthEntryTransition(entryDataReady);

  const entrySplash = showEntrySplash ? (
    <AuthEntrySplash
      variant="agency"
      startedAt={entryStartedAt}
      exiting={isEntrySplashExiting}
      agencyName={agencyProfile?.agency_name}
      avatarUrl={resolveAgencyEntryAvatar(agencyProfile)}
      avatarInitials={resolveEntryDisplayName(agencyProfile, 'agency').slice(0, 2).toUpperCase()}
    />
  ) : null;

  if (isLoading) {
    return (
      entrySplash || (
        <div className="flex items-center justify-center h-screen bg-[#faf9f7]">
          <LoadingSpinner size="lg" />
        </div>
      )
    );
  }

  if (isError || !data?.authenticated) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (data.role !== 'AGENCY') {
    return <Navigate to={data.redirect || '/login'} replace />;
  }

  const isSetupRoute = location.pathname === '/dashboard/agency/setup';
  if (!data.agencyOnboardingCompletedAt && !isSetupRoute) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/dashboard/agency/setup?returnTo=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <AgencyPermissionsProvider session={data}>
      <AgencyLegalAcceptanceGate statusQuery={legalStatusQuery}>
        {entrySplash}
        <Outlet />
      </AgencyLegalAcceptanceGate>
    </AgencyPermissionsProvider>
  );
}
