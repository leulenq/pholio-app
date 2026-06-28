import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../domains/auth/hooks/useAuth';
import { useAuthEntryTransition } from '../../domains/auth/hooks/useAuthEntryTransition';
import AuthEntrySplash from '../../domains/auth/components/AuthEntrySplash';
import {
  resolveEntryDisplayName,
  resolveTalentEntryAvatar,
  resolveTalentGreetingName,
} from '../../domains/auth/lib/entry-identity';
import TalentLayout from './TalentLayout';
import { checkGatingStatus, getProfileGateFeature, isRestrictedTalentRoute } from '../utils/profileGating';
import { talentApi } from '../../domains/talent/api/talent';
import ProfileUnlockExperience from '../../domains/onboarding/components/ProfileUnlockExperience';
import ProfileGateBanner from '../components/gating/ProfileGateBanner';
import LegalAcceptanceGate from '../components/LegalAcceptanceGate';

export default function DashboardLayoutShell() {
  const { profile, images, isLoading, isError, error } = useAuth();
  const location = useLocation();
  const authBootstrapReady = !isLoading || isError;
  const { showEntrySplash, isEntrySplashExiting, entryStartedAt } =
    useAuthEntryTransition(authBootstrapReady);
  const [promptContext, setPromptContext] = useState(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const gating = useMemo(() => checkGatingStatus(profile, images), [profile, images]);
  const { isBlocked } = gating;
  const isRouteGated = isBlocked && isRestrictedTalentRoute(location.pathname);
  const gateFeature = getProfileGateFeature(location.pathname);
  const celebrationKey = useMemo(() => `talent-gate-celebrated:${profile?.id || 'unknown'}`, [profile?.id]);

  useEffect(() => {
    let cancelled = false;

    async function maybeOpenPrompt() {
      if (isLoading || !profile?.id || isBlocked) return;
      if (!location.pathname.startsWith('/dashboard/talent')) return;

      const celebrated = window.localStorage.getItem(celebrationKey);
      if (celebrated === '1') return;

      try {
        const context = await talentApi.getApplicationPromptContext();
        if (cancelled) return;
        setPromptContext(context?.data || context || null);
      } catch {
        if (cancelled) return;
        setPromptContext({ hasRedirectSignal: false, targetAgency: null });
      }
      if (!cancelled) setIsPromptOpen(true);
    }

    maybeOpenPrompt();
    return () => { cancelled = true; };
  }, [isLoading, profile?.id, isBlocked, location.pathname, celebrationKey]);

  const dismissPrompt = () => {
    setIsPromptOpen(false);
    if (profile?.id) {
      window.localStorage.setItem(celebrationKey, '1');
    }
  };

  // If API says onboarding is required, redirect to casting flow
  if (error && error.data?.error === 'onboarding_required') {
    return <Navigate to="/onboarding" replace />;
  }

  const entrySplash = showEntrySplash ? (
    <AuthEntrySplash
      variant="talent"
      startedAt={entryStartedAt}
      exiting={isEntrySplashExiting}
      talentName={resolveTalentGreetingName(profile)}
      avatarUrl={resolveTalentEntryAvatar(profile, images)}
      avatarInitials={resolveEntryDisplayName(profile, 'talent').slice(0, 2).toUpperCase()}
    />
  ) : null;

  if (isLoading && !isError) {
    return (
      entrySplash || (
        <div className="flex items-center justify-center h-screen bg-[#faf9f7]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )
    );
  }

  return (
    <LegalAcceptanceGate>
      {entrySplash}
      <TalentLayout outletContext={{ ...gating }}>
        {isRouteGated ? (
          <ProfileGateBanner
            variant="page"
            featureName={gateFeature.featureName}
            featureLabel={gateFeature.featureLabel}
            description={gateFeature.description}
            {...gating}
          />
        ) : null}
      </TalentLayout>
      <ProfileUnlockExperience
        isOpen={isPromptOpen}
        mode={promptContext?.hasRedirectSignal ? 'targeted' : 'generic'}
        targetAgency={promptContext?.targetAgency}
        profile={profile}
        onClose={dismissPrompt}
      />
    </LegalAcceptanceGate>
  );
}
