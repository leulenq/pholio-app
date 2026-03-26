import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../domains/auth/hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import Header from '../components/Header/Header';
import { checkGatingStatus, isRestrictedTalentRoute } from '../utils/profileGating';
import { talentApi } from '../../domains/talent/api/talent';
import LuxuryCompletionPromptModal from '../../domains/onboarding/components/LuxuryCompletionPromptModal';
import ProfileGateBanner from '../components/gating/ProfileGateBanner';




// Internal Header removed. Using imported component.

export default function DashboardLayoutShell() {
  const { user, profile, isLoading, error } = useAuth();
  const { message, clearFlash } = useFlash();
  const navigate = useNavigate();
  const location = useLocation();
  const [promptContext, setPromptContext] = useState(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isPromptLoading, setIsPromptLoading] = useState(false);
  const [isPrimarySubmitting, setIsPrimarySubmitting] = useState(false);
  const [promptError, setPromptError] = useState('');
  const gating = checkGatingStatus(profile);
  const { isBlocked, missingFields } = gating;
  const promptStorageKey = useMemo(() => `talent-completion-prompt:${profile?.id || 'unknown'}`, [profile?.id]);

  useEffect(() => {
    let cancelled = false;

    async function maybeOpenPrompt() {
      if (isLoading || !profile?.id || isBlocked) return;
      if (!location.pathname.startsWith('/dashboard/talent')) return;

      const dismissed = window.sessionStorage.getItem(promptStorageKey);
      if (dismissed === '1') return;

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
  }, [isLoading, profile?.id, isBlocked, location.pathname, promptStorageKey]);

  const dismissPrompt = () => {
    setIsPromptOpen(false);
    if (profile?.id) {
      window.sessionStorage.setItem(promptStorageKey, '1');
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

    setIsPrimarySubmitting(true);
    try {
      const agenciesRes = await talentApi.getAgencies();
      const agencies = agenciesRes?.data || agenciesRes || [];
      if (!agencies.length) {
        setPromptError('No agencies are available right now. Please try again shortly.');
        setIsPrimarySubmitting(false);
        return;
      }

      const target = agencies[0];
      await talentApi.createApplication({ agencyId: target.id });
      toast.success(`Application submitted to ${target.name || 'an agency'}.`);
      dismissPrompt();
      navigate('/dashboard/talent/applications');
    } catch (applyErr) {
      const msg = applyErr?.data?.error || applyErr?.message || 'Could not submit application right now.';
      setPromptError(msg);
    } finally {
      setIsPrimarySubmitting(false);
    }
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

  if (isBlocked && isRestrictedTalentRoute(location.pathname)) {
    const from = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    return <Navigate to={`/dashboard/talent/profile?gate=true&from=${from}`} replace />;
  }

  return (
    <div className="dashboard-root">
      <Header user={user} profile={profile} />

      {/* {isBlocked && (
        <ProfileGateBanner
          missingFields={missingFields}
          missingByGroup={gating.missingByGroup}
          completionPercent={gating.completionPercent}
          completedCount={gating.completedCount}
          totalRequired={gating.totalRequired}
        />
      )} */}

      <main className="dashboard-content">
        {message && (
          <div className={`flash-message ${message.type} mb-6`}>
             <span>{message.text}</span>
             <button onClick={clearFlash} className="flash-close">&times;</button>
          </div>
        )}

        <Outlet context={{ isBlocked }} />
      </main>

      <LuxuryCompletionPromptModal
        isOpen={isPromptOpen}
        mode={promptContext?.hasRedirectSignal ? 'targeted' : 'generic'}
        targetAgency={promptContext?.targetAgency}
        isSubmitting={isPrimarySubmitting || isPromptLoading}
        onPrimaryAction={handlePrimaryAction}
        onSecondaryAction={dismissPrompt}
        onClose={dismissPrompt}
        errorMessage={promptError}
      />
    </div>
  );
}
