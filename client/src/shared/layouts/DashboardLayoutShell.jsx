import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../domains/auth/hooks/useAuth';
import { useAuthEntryHandoff } from '../../domains/auth/hooks/useAuthEntry';
import PageLoadingScreen from '../components/shared/PageLoadingScreen';
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

// Persist the one-shot "celebration seen" marker durably. A single fire-and-
// forget POST is too fragile for a once-ever guarantee, so retry with backoff.
async function persistUnlockCelebrated(retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await talentApi.markUnlockCelebrated();
      return;
    } catch {
      if (attempt === retries) return;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
    }
  }
}

export default function DashboardLayoutShell() {
  const { user, profile, images, isLoading, isError, error } = useAuth();
  const location = useLocation();
  const authBootstrapReady = !isLoading || isError;
  const [promptContext, setPromptContext] = useState(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  // Local one-shot guard so the experience can't re-open mid-session between
  // dismissal and the profile query picking up the freshly-set server flag.
  const [hasCelebratedThisSession, setHasCelebratedThisSession] = useState(false);
  const gating = useMemo(() => checkGatingStatus(profile, images), [profile, images]);
  const { isBlocked } = gating;
  const isRouteGated = isBlocked && isRestrictedTalentRoute(location.pathname);
  const gateFeature = getProfileGateFeature(location.pathname);

  // Hand off to the app-level entry splash: who arrived, and when this shell is
  // genuinely usable. `authBootstrapReady` is reported from an effect in the
  // component that renders <Outlet/>, so a route still suspending on its lazy
  // chunk cannot commit — and the splash cannot fade out onto a route fallback.
  useAuthEntryHandoff(authBootstrapReady, {
    variant: 'talent',
    name: profile ? resolveTalentGreetingName(profile) : null,
    avatarUrl: resolveTalentEntryAvatar(profile, images, user),
    initials: profile
      ? resolveEntryDisplayName(profile, 'talent').slice(0, 2).toUpperCase()
      : null,
  });

  useEffect(() => {
    let cancelled = false;

    async function maybeOpenPrompt() {
      if (isLoading || !profile?.id || isBlocked) return;
      if (!location.pathname.startsWith('/dashboard/talent')) return;
      if (hasCelebratedThisSession || profile.unlock_celebrated_at) return;

      // Never run the celebration over the legal-acceptance scrim. If updated
      // Terms/Privacy are pending, defer the walkthrough until consent is
      // recorded; fail safe (defer) if legal status can't be determined.
      try {
        const legal = await talentApi.getLegalStatus({ skipRedirect: true });
        if (cancelled) return;
        if (legal?.needsAcceptance) return;
      } catch {
        return;
      }

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
  }, [
    isLoading,
    profile?.id,
    profile?.unlock_celebrated_at,
    isBlocked,
    location.pathname,
    hasCelebratedThisSession,
  ]);

  const dismissPrompt = () => {
    setIsPromptOpen(false);
    setHasCelebratedThisSession(true);
    // The "only once per talent" guarantee lives in durable server metadata, so
    // this write must actually land. Retry with backoff rather than dropping it
    // on the first transient failure (which would replay the celebration next
    // session). The session guard above still prevents any mid-session reopen.
    persistUnlockCelebrated();
  };

  // If API says onboarding is required, redirect to casting flow
  if (error && error.data?.error === 'onboarding_required') {
    return <Navigate to="/onboarding" replace />;
  }

  // If user role is AGENCY or API returned 403 Forbidden (role mismatch), redirect to Agency Dashboard
  if (user?.role === 'AGENCY' || (isError && (error?.status === 403 || error?.data?.role === 'AGENCY'))) {
    return <Navigate to="/dashboard/agency" replace />;
  }

  if (isLoading && !isError) {
    return <PageLoadingScreen />;
  }

  return (
    <LegalAcceptanceGate>
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
        invitation={
          promptContext?.source === 'open_call'
            ? { isOpenCall: true, expiresAt: promptContext?.claimExpiresAt }
            : null
        }
        profile={profile}
        onClose={dismissPrompt}
      />
    </LegalAcceptanceGate>
  );
}
