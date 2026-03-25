import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../domains/auth/hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import Header from '../components/Header/Header';
import { checkGatingStatus } from '../utils/profileGating';
import { talentApi } from '../../domains/talent/api/talent';
import LuxuryCompletionPromptModal from '../../domains/onboarding/components/LuxuryCompletionPromptModal';




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
  const { isBlocked, missingFields } = checkGatingStatus(profile, user);
  const promptStorageKey = useMemo(() => `talent-completion-prompt:${profile?.id || 'unknown'}`, [profile?.id]);
  const missingString = missingFields.map(f => f.label).slice(0, 3).join(', ') + (missingFields.length > 3 ? ` +${missingFields.length - 3} more` : '');

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

  return (
    <div className="dashboard-root">
      <Header user={user} profile={profile} />

      {/* Elegant Gating Banner */}
      {isBlocked && (
        <div className="relative z-30 bg-[#121212] border-b border-[#2a2a2a] shadow-sm">
          {/* Subtle Top Border */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#C9A55A]/50 to-transparent" />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
            <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
               <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#C9A55A]/10 text-[#C9A55A] flex-shrink-0">
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
               </div>
               <div className="flex flex-col min-w-0">
                  <div className="text-[13px] font-medium text-white flex items-baseline gap-2">
                    Profile Incomplete
                    <span className="text-[11px] text-zinc-400 font-normal hidden md:inline">Finish setting up your profile to become visible to agencies.</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                    Missing: <span className="text-zinc-300">{missingString}</span>
                  </div>
               </div>
            </div>
            
            <Link
              to="/dashboard/talent/profile?gate=true"
              className="flex-shrink-0 px-4 py-1.5 bg-white hover:bg-[#C9A55A] text-black hover:text-white text-[11px] font-bold uppercase tracking-wider rounded-full transition-colors flex items-center gap-1.5"
            >
              <span>Complete Profile</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </div>
        </div>
      )}

      <main className="dashboard-content">
        {message && (
          <div className={`flash-message ${message.type} mb-6`}>
             <span>{message.text}</span>
             <button onClick={clearFlash} className="flash-close">&times;</button>
          </div>
        )}

        {/* Gating Enforcer: If blocked, prevent access to restricted routes */}
        {/* We rely on the Sidebar (which is part of Outlet's layout usually, or imported?) 
            Wait, DashboardLayoutShell wraps Outlet. The Sidebar is usually in DashboardLayoutShell 
            or the page itself. 
            Checking file again... DashboardLayoutShell DOES NOT RENDER A SIDEBAR explicitly in the code I seeing.
            It renders <Outlet />.
            
            Let me check `src/routes/DashboardPage.jsx` or similar. 
            Ah, `DashboardLayoutShell.jsx` (lines 1-71) only has Header + Outlet. 
            Where is the Sidebar? 
            
            NavItems are on the Header in this design? 
            "Header.jsx" has the nav items according to recent view.
            
            OK, so I need to block the ROUTES themselves or the Header Links.
            I will block the Outlet content if it's not a allowed route? 
            No, better to update Header navigation items.
            
            For now, I'm updating the Shell to show the BLOCKING banner. 
            I will blocking logic in Header.jsx next.
        */}

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
