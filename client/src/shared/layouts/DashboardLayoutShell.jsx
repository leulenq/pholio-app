import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../domains/auth/hooks/useAuth';
import TalentLayout from './TalentLayout';
import { checkGatingStatus, getProfileGateFeature, isRestrictedTalentRoute } from '../utils/profileGating';
import { talentApi } from '../../domains/talent/api/talent';
import ProfileUnlockExperience from '../../domains/onboarding/components/ProfileUnlockExperience';
import ProfileGateBanner from '../components/gating/ProfileGateBanner';




export default function DashboardLayoutShell() {
  const { profile, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [promptContext, setPromptContext] = useState(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isPromptLoading, setIsPromptLoading] = useState(false);
  const [isPrimarySubmitting, setIsPrimarySubmitting] = useState(false);
  const [promptError, setPromptError] = useState('');
  const gating = checkGatingStatus(profile);
  const { isBlocked } = gating;
  const isRouteGated = isBlocked && isRestrictedTalentRoute(location.pathname);
  const gateFeature = getProfileGateFeature(location.pathname);
  // Fire once ever, per profile, the first time the profile gate is open.
  const celebrationKey = useMemo(() => `talent-gate-celebrated:${profile?.id || 'unknown'}`, [profile?.id]);

  useEffect(() => {
    let cancelled = false;

    async function maybeOpenPrompt() {
      if (isLoading || !profile?.id || isBlocked) return;
      if (!location.pathname.startsWith('/dashboard/talent')) return;

      const celebrated = window.localStorage.getItem(celebrationKey);
      if (celebrated === '1') return;

      setIsPromptLoading(true);
      setPromptError('');
      try {
        const context = await talentApi.getApplicationPromptContext();
        if (cancelled) return;
        setPromptContext(context?.data || context || null);
        setIsPromptOpen(true);
      } catch {
        if (cancelled) return;
        setPromptContext({
          hasRedirectSignal: false,
          targetAgency: null,
          alreadyAppliedToTarget: false
        });
        setIsPromptOpen(true);
      } finally {
        if (!cancelled) setIsPromptLoading(false);
      }
    }

    maybeOpenPrompt();
    return () => {
      cancelled = true;
    };
  }, [isLoading, profile?.id, isBlocked, location.pathname, celebrationKey]);

  const dismissPrompt = () => {
    setIsPromptOpen(false);
    if (profile?.id) {
      window.localStorage.setItem(celebrationKey, '1');
    }
  };

  const handlePrimaryAction = async () => {
    const isTargeted = !!promptContext?.hasRedirectSignal && !!promptContext?.targetAgency?.id;
    setPromptError('');

    if (isTargeted) {
      if (promptContext?.alreadyAppliedToTarget) {
        toast.info('Application already submitted to this agency.');
        dismissPrompt();
        navigate('/dashboard/talent/applications');
        return;
      }

      setIsPrimarySubmitting(true);
      try {
        await talentApi.createApplication({ agencyId: promptContext.targetAgency.id });
        toast.success(`Application submitted to ${promptContext.targetAgency.name}.`);
        dismissPrompt();
        navigate('/dashboard/talent/applications');
      } catch (applyErr) {
        const msg = applyErr?.data?.error || applyErr?.message || 'Could not submit application right now.';
        setPromptError(msg);
      } finally {
        setIsPrimarySubmitting(false);
      }
      return;
    }

    dismissPrompt();
    navigate('/dashboard/talent/applications#app-discovery');
  };

  // If API says onboarding is required, redirect to casting flow
  if (error && error.data?.error === 'onboarding_required') {
    return <Navigate to="/onboarding" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#faf9f7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <>
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
        isSubmitting={isPrimarySubmitting || isPromptLoading}
        onPrimaryAction={handlePrimaryAction}
        onSecondaryAction={dismissPrompt}
        onClose={dismissPrompt}
        errorMessage={promptError}
      />
    </>
  );
}
