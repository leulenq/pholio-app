import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import LoadingSpinner from '../../../shared/components/shared/LoadingSpinner';

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#faf9f7]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !data?.authenticated) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (data.role !== 'AGENCY') {
    return <Navigate to={data.redirect || '/login'} replace />;
  }

  if (data.redirect === '/dashboard/agency/onboarding' && location.pathname !== '/dashboard/agency/onboarding') {
    return <Navigate to="/dashboard/agency/onboarding" replace />;
  }

  if (data.redirect === '/dashboard/agency' && location.pathname === '/dashboard/agency/onboarding') {
    return <Navigate to="/dashboard/agency" replace />;
  }

  return <Outlet />;
}
