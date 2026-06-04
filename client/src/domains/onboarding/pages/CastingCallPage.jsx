/**
 * Casting Call Page
 * Main controller for the refactored casting flow
 * 
 * Flow: Entry → Scout → Measurements → Profile → Complete
 */

import React, { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { talentApi } from '../../talent/api/talent';
import { useCastingComplete, useCastingStatus } from '../hooks/useCasting';

// Step Components
import CastingEntry from './CastingEntry';
import CastingScout from './CastingScout';
import CastingMeasurements from './CastingMeasurements';
import CastingGender from './CastingGender';
import CastingProfile from './CastingProfile';
import OnboardingDevPanel from '../dev/OnboardingDevPanel';
import { PREVIEW_SEED, PREVIEW_STEPS, parsePreviewParam } from '../dev/onboardingPreview';
import '../styles/CastingCinematic.css';

// Dev-only review harness toggle. Statically false in production builds, so the
// preview state, seeding, and panel all dead-code-eliminate out.
const DEV_PREVIEW = import.meta.env.DEV;

// User-facing guided steps shown in the rail (entry/auth precedes the rail,
// the finishing preloader follows it).
const RAIL_STEPS = [
  { view: 'gender', label: 'Identity' },
  { view: 'scout', label: 'Portrait' },
  { view: 'measurements', label: 'Measurements' },
  { view: 'profile', label: 'Details' },
];

function CastingCallPage() {
  const navigate = useNavigate();
  // Note: no auto-redirect for already-authenticated users here. /onboarding
  // stays freely viewable; auth enforcement lives on the /dashboard/* routes
  // (their layout gates + server requireAuth redirect to the right login).
  const [searchParams] = useSearchParams();
  const plan = searchParams.get('plan');
  const [currentView, setCurrentView] = useState('entry');
  const [photoData, setPhotoData] = useState(null);
  const [profileData, setProfileData] = useState({});
  const [currentEntryProgress, setCurrentEntryProgress] = useState(0);

  // ── Dev-only review harness ──────────────────────────────────────────────
  // When active, jump to any step/sub-step with seeded state and bypass the
  // server-driven gating. All guarded by DEV_PREVIEW so production is untouched.
  const [preview, setPreview] = useState(() =>
    DEV_PREVIEW ? parsePreviewParam(searchParams.get('preview')) : null,
  );
  const previewActive = DEV_PREVIEW && !!preview;
  const previewFinishing = previewActive && preview.view === 'finishing';

  React.useEffect(() => {
    if (!previewActive) return;
    // Replace local state with realistic seed data, then jump to the step.
    setProfileData(PREVIEW_SEED.profileData);
    setPhotoData(PREVIEW_SEED.photoData);
    if (preview.view !== 'finishing') setCurrentView(preview.view);
  }, [previewActive, preview]);

  const { data: status, isLoading, error } = useCastingStatus();

  // Step 1: Entry Complete
  const handleEntryComplete = ({ manualData }) => {
    // If manual signup included data (previously included gender, now just name/email)
    if (manualData) {
      setProfileData(prev => ({ ...prev, ...manualData }));
    }

    // Always go to Gender selection next (All users: Manual & Google)
    setCurrentView('gender');
  };

  // Step 1.5: Gender Complete (gender already persisted by CastingGender)
  const handleGenderComplete = (data) => {
    setProfileData(prev => ({ ...prev, gender: data.gender }));
    setCurrentView('scout');
  };

  // Step 2: Scout Complete
  const handleScoutComplete = (data) => {
    setPhotoData(data);
    setCurrentView('measurements');
  };

  // Step 3: Measurements Complete
  const handleMeasurementsComplete = (measurements) => {
    setProfileData(prev => ({ ...prev, ...measurements }));
    setCurrentView('profile');
  };

  // Step 4: Profile Complete → Done
  const completeMutation = useCastingComplete();
  const [isFinishing, setIsFinishing] = useState(false);

  const handleProfileComplete = async (profile) => {
    setProfileData(prev => ({ ...prev, ...profile }));
    setIsFinishing(true);

    // Onboarding is already finalized server-side by CastingProfile's /profile
    // call. /complete is an idempotent safety net — its failure must not block
    // the paid-plan checkout or the reveal handoff below.
    try {
      await completeMutation.mutateAsync();
    } catch (error) {
      console.error('[CastingCallPage] /complete failed (onboarding already finalized):', error);
    }

    // Paid plan → Stripe checkout, decoupled from the /complete result so a
    // failed safety-net call never strands a paying user.
    if (plan === 'studio') {
      try {
        const data = await talentApi.createCheckoutSession();
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
      } catch (checkoutError) {
        console.error('[CastingCallPage] Stripe checkout failed, falling back to reveal:', checkoutError);
      }
    }

    // Hold the preloader for a cinematic beat before navigating
    setTimeout(() => navigate('/reveal'), 2800);
  };

  // Step 5: Complete - Redirect to dashboard
  const handleComplete = useCallback(() => {
    navigate('/reveal');
  }, [navigate]);

  // One-time rehydration: seed local state from the server's persisted answers
  // so a mid-flow reload resumes with the data the user already entered
  // (gender, measurements, predictions) instead of empty defaults.
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (previewActive) return; // dev preview owns the state; skip server hydration
    if (hydratedRef.current || !status?.state) return;
    hydratedRef.current = true;

    const p = status.profile || {};
    setProfileData((prev) => ({
      ...prev,
      ...(p.gender && { gender: p.gender }),
      ...(p.city && { city: p.city }),
      ...(p.experience_level && { experience_level: p.experience_level }),
      ...(p.height_cm && { height_cm: p.height_cm }),
      ...(p.weight_kg && { weight_kg: p.weight_kg }),
      ...(p.bust_cm && { bust_cm: p.bust_cm }),
      ...(p.waist_cm && { waist_cm: p.waist_cm }),
      ...(p.hips_cm && { hips_cm: p.hips_cm }),
    }));

    const predictions = status.state.predictions || status.state.step_data?.scout?.predictions;
    const photoUrl = status.state.step_data?.scout?.photo_url;
    if (predictions || photoUrl) {
      setPhotoData((prev) => prev || { predictions, photo_url: photoUrl });
    }
  }, [status, previewActive]);

  // Resume an in-progress flow if the page is reloaded mid-onboarding.
  // We intentionally do NOT auto-forward already-completed ('done') accounts
  // anywhere — /onboarding stays freely viewable regardless of session. The
  // live completion path navigates to /reveal on its own (handleProfileComplete).
  React.useEffect(() => {
    if (previewActive) return; // don't let server state yank the previewed step
    if (!status?.state) return;

    let { current_step } = status.state;
    // Map legacy 'identity' state to the new flow's actual next step
    if (current_step === 'identity') {
      current_step = 'scout';
    }

    // Resume from where the user left off (skip 'done' — no auto-forward).
    if (currentView === 'entry' && current_step !== 'entry' && current_step !== 'done') {
      setCurrentView(current_step);
    }
  }, [status, navigate, currentView, previewActive]);

  // Auto-complete view - removed delayed transition since we instantly navigate now
  React.useEffect(() => {
    if (currentView === 'complete') {
      handleComplete();
    }
  }, [currentView, handleComplete]);

  if (!previewActive && isLoading && currentView !== 'entry') {
    return (
      <div className="cinematic-container">
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="cinematic-orb cinematic-orb-2" />
        <div className="flex flex-col items-center gap-6">
          <motion.div
            className="w-2.5 h-2.5 rounded-full bg-[#C9A55A]"
            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ boxShadow: '0 0 20px rgba(201, 165, 90, 0.5)' }}
          />
          <p className="text-[10px] font-sans uppercase tracking-[0.3em] text-white/30">
            Preparing your casting
          </p>
        </div>
      </div>
    );
  }

  if (!previewActive && error && currentView !== 'entry') {
    return (
      <div className="cinematic-container">
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="cinematic-orb cinematic-orb-2" />
        <div className="cinematic-focus-panel">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center text-center gap-6"
          >
            <h2 className="font-serif text-4xl text-white">Something went wrong</h2>
            <p className="text-white/40 font-sans max-w-md">
              {error.message || 'Please try again in a moment.'}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="reveal-cta"
            >
              Back to Login
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Cinematic preloader shown during the isFinishing → navigate('/reveal') transition

  const steps = ['entry', 'gender', 'scout', 'measurements', 'profile', 'complete'];
  const currentStepIndex = steps.indexOf(currentView);

  // Calculate Progress
  let progressPercentage = 0;
  if (currentView === 'complete' || isFinishing) {
    progressPercentage = 100;
  } else if (currentStepIndex !== -1) {
    // Progress calculation:
    // - Entry (index 0): 0% → 16.67% (with sub-progress)
    // - Scout (index 1): 16.67%
    // - Measurements (index 2): 33.33%
    // - Profile (index 3): 50%
    // - Reveal (index 4): 66.67%
    // - Complete (index 5): 100%
    const stepSize = 100 / steps.length;
    const baseProgress = currentStepIndex * stepSize;

    // Add sub-step progress only for Entry phase
    if (currentView === 'entry') {
      progressPercentage = baseProgress + (currentEntryProgress * stepSize);
    } else {
      progressPercentage = baseProgress;
    }
  }

  // Guided shell: which labeled step is active (entry/auth and the finishing
  // preloader sit outside the rail).
  const railIndex = isFinishing ? -1 : RAIL_STEPS.findIndex((s) => s.view === currentView);
  const railActive = railIndex !== -1;

  const handleStepBack = () => {
    if (railIndex > 0) setCurrentView(RAIL_STEPS[railIndex - 1].view);
  };

  return (
    <div className="cinematic-container">
      {/* Ambient Orbs */}
      <div className="cinematic-orb cinematic-orb-1" />
      <div className="cinematic-orb cinematic-orb-2" />

      <AnimatePresence>
        {railActive && railIndex > 0 && (
          <motion.button
            key="cine-back"
            type="button"
            className="cine-back"
            onClick={handleStepBack}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.3 }}
          >
            <ArrowLeft size={13} strokeWidth={1.6} />
            <span>Back</span>
          </motion.button>
        )}
      </AnimatePresence>

      <div className="cinematic-focus-panel">
        <AnimatePresence mode="wait">
          {(isFinishing || previewFinishing) ? (
            <motion.div
              key="preloader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center justify-center text-center gap-10"
            >
              {/* Pulsing concentric rings */}
              <div className="relative w-24 h-24">
                <motion.div
                  className="absolute inset-0 rounded-full border border-[#C9A55A]/20"
                  animate={{ scale: [1, 1.8, 1.8], opacity: [0.4, 0, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border border-[#C9A55A]/15"
                  animate={{ scale: [1, 2.2, 2.2], opacity: [0.3, 0, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border border-[#C9A55A]/10"
                  animate={{ scale: [1, 2.6, 2.6], opacity: [0.2, 0, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.8 }}
                />
                {/* Center dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    className="w-3 h-3 rounded-full bg-[#C9A55A]"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ boxShadow: '0 0 20px rgba(201, 165, 90, 0.5)' }}
                  />
                </div>
              </div>

              {/* Text sequence */}
              <div className="flex flex-col gap-3">
                <motion.p
                  className="font-serif text-2xl text-white/90 italic tracking-wide"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                >
                  Analyzing your profile
                </motion.p>
                <motion.p
                  className="text-[10px] font-sans uppercase tracking-[0.3em] text-white/25"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                >
                  Calculating casting readiness
                </motion.p>
              </div>
            </motion.div>
          ) : (
            <>
              {currentView === 'entry' && (
                <CastingEntry
                  key="entry"
                  onComplete={handleEntryComplete}
                  onProgress={setCurrentEntryProgress}
                />
              )}

              {currentView === 'gender' && (
                <CastingGender
                  key="gender"
                  onComplete={handleGenderComplete}
                />
              )}

              {currentView === 'scout' && (
                <CastingScout
                  key="scout"
                  onComplete={handleScoutComplete}
                  userName={previewActive ? PREVIEW_SEED.userName : status?.profile?.first_name}
                />
              )}

              {currentView === 'measurements' && (
                <CastingMeasurements
                  // Remount when the previewed sub-step changes so it re-enters there.
                  key={`measurements-${previewActive ? preview.subStep ?? 'start' : 'live'}`}
                  photoData={photoData}
                  onComplete={handleMeasurementsComplete}
                  initialStep={previewActive ? preview.subStep : undefined}
                />
              )}

              {currentView === 'profile' && (
                <CastingProfile
                  key={`profile-${previewActive ? preview.subStep ?? 'start' : 'live'}`}
                  onComplete={handleProfileComplete}
                  gender={profileData.gender}
                  initialProfileStep={previewActive ? preview.subStep : undefined}
                />
              )}

              {currentView === 'complete' && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <h1 className="cinematic-question">You're all set.</h1>
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Progress: a single quiet hairline across the very top of the page. */}
      <div className="cinematic-progress-container">
        <div
          className="cinematic-progress-bar"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Dev-only review harness — stripped from production builds */}
      {DEV_PREVIEW && (
        <OnboardingDevPanel
          steps={PREVIEW_STEPS}
          current={preview}
          onSelect={(sel) => setPreview(sel)}
          onExit={() => {
            setPreview(null);
            setCurrentView('entry'); // let server status drive the real flow again
          }}
        />
      )}
    </div>
  );
}

export default CastingCallPage;
