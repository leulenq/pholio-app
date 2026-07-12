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
import { getAgencyProfile } from '../api/agency';
import { AgencyPermissionsProvider } from '../context/AgencyPermissionsProvider';

async function getSession() {
  const response = await fetch('/api/session', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to load session');
  }

  return response.json();
}

export default function AgencySessionGate() {
  const location = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['session', 'agency'],
    queryFn: getSession,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: agencyProfile } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const { showEntrySplash, isEntrySplashExiting, entryStartedAt } = useAuthEntryTransition(!isLoading);

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
      {entrySplash}
      <Outlet />
    </AgencyPermissionsProvider>
  );
}
