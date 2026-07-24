/**
 * Casting Call Page
 * Main controller for the talent onboarding flow.
 *
 * Flow: Entry → Birthdate → Gender → Scout → Measurements → Profile → Reveal
 * (birthdate before gender: the age gate precedes further personal data)
 */

import React, { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { talentApi } from '../../talent/api/talent';
import { useCastingComplete, useCastingStatus } from '../hooks/useCasting';
import { SubscriptionCheckoutModal } from '../../../shared/components/SubscriptionCheckoutDisclosure';
import CheckoutHandoff from '../../../shared/components/billing/CheckoutHandoff';
import { useBrandedStripeCheckout } from '../../../shared/hooks/useBrandedStripeCheckout';

// Step Components
import CastingEntry from './CastingEntry';
import CastingScout from './CastingScout';
import CastingMeasurements from './CastingMeasurements';
import CastingGender from './CastingGender';
import CastingBirthdate from './CastingBirthdate';
import CastingProfile from './CastingProfile';
import CastingVerifyEmail from './CastingVerifyEmail';
import AcknowledgmentBeat from './AcknowledgmentBeat';
import ActionDock from '../components/ActionDock';
import { ActionDockProvider } from '../components/ActionDockContext';
import OnboardingDevPanel from '../dev/OnboardingDevPanel';
import { PREVIEW_SEED, PREVIEW_STEPS, parsePreviewParam } from '../dev/onboardingPreview';
import { canCollectSensitiveProfileFields } from '../../../shared/utils/talentAge';
import '../styles/CastingCinematic.css';
import './CastingScout.screen.css';

// Dev-only review harness toggle. Statically false in production builds, so the
// preview state, seeding, and panel all dead-code-eliminate out.
const DEV_PREVIEW = import.meta.env.DEV;

// User-facing guided steps shown in the rail (entry/auth precedes the rail,
// the finishing preloader follows it).
const RAIL_STEPS = [
  { view: 'birthdate', label: 'Birthdate' },
  { view: 'gender', label: 'Identity' },
  { view: 'scout', label: 'Digitals' },
  { view: 'measurements', label: 'Stats' },
  { view: 'profile', label: 'Details' },
];

// Legacy step names that can still live in old rows' onboarding_state_json.
// The server heals these too; this is belt-and-braces for stale /status data.
const LEGACY_STEP_MAP = {
  identity: 'birthdate',
  verification_pending: 'birthdate',
};

function CastingCallPage() {
  const navigate = useNavigate();
  // Note: no auto-redirect for already-authenticated users here. /onboarding
  // stays freely viewable; auth enforcement lives on the /dashboard/* routes
  // (their layout gates + server requireAuth redirect to the right login).
  const [searchParams] = useSearchParams();
  const plan = searchParams.get('plan');
  const [currentView, setCurrentView] = useState('entry');
  const [, setPhotoData] = useState(null);
  const [profileData, setProfileData] = useState({});
  const [currentEntryProgress, setCurrentEntryProgress] = useState(0);
  const [signupMethod, setSignupMethod] = useState(null); // 'google' | 'instagram' | 'manual'
  const [oauthUserData, setOauthUserData] = useState(null); // { name, email, picture }
  const [isEntryAuthenticating, setIsEntryAuthenticating] = useState(false);

  // Paint the document surface black for the duration of the casting flow so
  // the top safe-area / status-bar region (which adopts the body background
  // under viewport-fit=cover) is dark instead of the app's light neutral.
  // Restored on unmount so the dashboard's light theme is untouched.
  React.useEffect(() => {
    document.body.classList.add('casting-dark-body');
    return () => document.body.classList.remove('casting-dark-body');
  }, []);

  // Single back action: steps with internal sub-steps register a handler; when
  // it returns true the sub-step consumed the back, otherwise we leave the step.
  const backOverrideRef = React.useRef(null);
  const registerBack = useCallback((fn) => {
    backOverrideRef.current = fn;
  }, []);

  // ── Dev-only review harness ──────────────────────────────────────────────
  // When active, jump to any step/sub-step with seeded state and bypass the
  // server-driven gating. All guarded by DEV_PREVIEW so production is untouched.
  const [preview, setPreview] = useState(() =>
    DEV_PREVIEW ? parsePreviewParam(searchParams.get('preview')) : null,
  );
  const previewActive = DEV_PREVIEW && !!preview;
  const previewFinishing = previewActive && preview.view === 'finishing';

  // Step 1: Entry Complete → greet beat (when we know a name) → birthdate.
  // Declared here so the preview effect below can reference setGreetName.
  const [greetName, setGreetName] = useState(null);

  React.useEffect(() => {
    if (!previewActive) return;
    // Dev-only preview harness: seeds UI state for visual QA (not reachable in production).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dev-only harness, intentional synchronous seed
    setProfileData(PREVIEW_SEED.profileData);
    setPhotoData(PREVIEW_SEED.photoData);
    if (preview.view === 'reveal') {
      navigate('/reveal');
      return;
    }
    if (preview.view === 'greet') {
      const provider = preview.subStep || 'google';
      setSignupMethod(provider);
      setOauthUserData({
        name: 'Ava Martinez',
        email: 'ava.martinez@gmail.com',
        picture: provider === 'google' 
          ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'
          : 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80',
      });
      setGreetName('Ava');
    }
    if (preview.view === 'verify') {
      setSignupMethod('manual');
      setOauthUserData({ name: 'Ava Martinez', email: 'ava.martinez@gmail.com', picture: '' });
      setGreetName('Ava');
    }
    if (preview.view !== 'finishing') setCurrentView(preview.view);
  }, [previewActive, preview, navigate]);

  // Custom Greet Beat auto-advance and click-to-skip handling for all signups.
  // Email/password signups pass through the inbox beat first — their address
  // is unverified until the Firebase link is clicked. OAuth arrives verified.
  const afterGreetView = 'birthdate';
  React.useEffect(() => {
    if (currentView !== 'greet') return;
    if (previewActive) return; // Do not auto-advance when previewing!

    const timer = setTimeout(() => {
      setCurrentView(afterGreetView);
    }, 2800);

    const skip = () => {
      setCurrentView(afterGreetView);
    };

    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [currentView, signupMethod, afterGreetView, previewActive]);

  const { data: status, isLoading, error } = useCastingStatus();

  // Minors (and age-unknown profiles) never enter body measurements during
  // onboarding — height only, unlocked later via guardian consent. Mirrors the
  // server's fail-closed canCollectSensitiveProfileFields gate. The dev preview
  // harness seeds an adult flow and bypasses the gate.
  const heightOnlyMeasurements =
    !previewActive &&
    !canCollectSensitiveProfileFields({
      date_of_birth: profileData.date_of_birth || status?.profile?.date_of_birth,
      guardian_consent_at: status?.profile?.guardian_consent_at,
    });

  // Step 1: Entry Complete → greet beat (when we know a name) → birthdate.
  // "Good to meet you, {name}." is one of the House's three name uses.
  // (greetName declared above the preview effect so the dev harness can reference it.)
  const handleEntryComplete = ({ method, name, email, picture, manualData }) => {
    if (method) {
      setSignupMethod(method);
      setOauthUserData({
        name: name || manualData?.name || '',
        email: email || manualData?.email || '',
        picture: picture || manualData?.picture || '',
      });
    }

    if (manualData) {
      setProfileData(prev => ({ ...prev, ...manualData }));
    }

    const rawName = name || manualData?.name || status?.profile?.first_name || '';
    const firstName = rawName.trim().split(' ')[0];
    if (firstName && firstName !== 'New' && firstName !== 'User') {
      setGreetName(firstName);
      setCurrentView(method === 'manual' ? 'verify' : 'greet');
      return;
    }
    // No greet without a usable name; email signups still take the inbox beat.
    setCurrentView(method === 'manual' ? 'verify' : 'birthdate');
  };

  // Step 1.5: Birthdate Complete (age gate before any further personal data)
  const handleBirthdateComplete = (data) => {
    setProfileData(prev => ({ ...prev, date_of_birth: data.date_of_birth, age: data.age }));
    setCurrentView('gender');
  };

  // Step 1.6: Gender Complete (gender already persisted by CastingGender)
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
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const { handoffOpen, redirectToCheckout } = useBrandedStripeCheckout(
    (payload) => talentApi.createCheckoutSession(payload),
  );

  const finishToReveal = () => {
    setTimeout(() => navigate('/reveal'), 2800);
  };

  const handleCheckoutConfirm = async (payload) => {
    setCheckoutModalOpen(false);
    setIsOpeningCheckout(true);
    try {
      const data = await redirectToCheckout(payload);
      if (!data?.url) {
        finishToReveal();
      }
    } catch (checkoutError) {
      console.error('[CastingCallPage] Stripe checkout failed, falling back to reveal:', checkoutError);
      finishToReveal();
    } finally {
      setIsOpeningCheckout(false);
    }
  };

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
      setCheckoutModalOpen(true);
      return;
    }

    // Hold the preloader for a cinematic beat before navigating
    finishToReveal();
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
      ...(p.date_of_birth && { date_of_birth: p.date_of_birth }),
      ...(p.city && { city: p.city }),
      ...(p.height_cm && { height_cm: p.height_cm }),
      ...(p.bust_cm && { bust_cm: p.bust_cm }),
      ...(p.waist_cm && { waist_cm: p.waist_cm }),
      ...(p.hips_cm && { hips_cm: p.hips_cm }),
      ...(p.chest_cm && { chest_cm: p.chest_cm }),
      ...(p.inseam_cm && { inseam_cm: p.inseam_cm }),
    }));

    const photoUrl = status.state.step_data?.scout?.photo_url;
    if (photoUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration guarded by hydratedRef; not a cascading pattern
      setPhotoData((prev) => prev || { photo_url: photoUrl });
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
    current_step = LEGACY_STEP_MAP[current_step] || current_step;

    // Resume from where the user left off (skip 'done' — no auto-forward).
    if (currentView === 'entry' && current_step !== 'entry' && current_step !== 'done') {
      // An email/password signup that reloaded before verifying re-enters the
      // inbox beat first. Only at birthdate (the step right after entry) — a
      // user already deeper in the flow is never yanked back.
      const needsVerifyBeat =
        current_step === 'birthdate' &&
        status.user?.auth_method === 'email' &&
        !status.user?.email_verified;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- routing effect to resume mid-flow; fires at most once per session step
      setCurrentView(needsVerifyBeat ? 'verify' : current_step);
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

  // The greet beat shares entry's progress slot — it isn't a step of its own.
  const steps = ['entry', 'birthdate', 'gender', 'scout', 'measurements', 'profile', 'complete'];
  const currentStepIndex = steps.indexOf(
    currentView === 'greet' || currentView === 'verify' ? 'entry' : currentView,
  );

  // Progress: each of the 7 steps advances the hairline by an equal share;
  // entry adds sub-step progress while the auth screens play out.
  let progressPercentage = 0;
  if (currentView === 'complete' || isFinishing) {
    progressPercentage = 100;
  } else if (currentStepIndex !== -1) {
    const stepSize = 100 / steps.length;
    const baseProgress = currentStepIndex * stepSize;

    if (currentView === 'entry') {
      progressPercentage = baseProgress + (currentEntryProgress * stepSize);
    } else {
      progressPercentage = baseProgress;
    }
  }

  // Guided shell: which labeled step is active (entry/auth and the finishing
  // preloader sit outside the rail).
  const railIndex = isFinishing ? -1 : RAIL_STEPS.findIndex((s) => s.view === currentView);
  const railActive = !isFinishing && !previewFinishing && currentView !== 'complete' && currentView !== 'greet' && currentView !== 'verify' && currentView !== 'entry' && currentView !== 'finishing' && !isEntryAuthenticating;

  const handleStepBack = () => {
    if (backOverrideRef.current?.()) return;
    if (railIndex > 0) setCurrentView(RAIL_STEPS[railIndex - 1].view);
  };

  // Best-available first name, used to personalize step headlines. Steps don't
  // all consume it yet (page rewrites will); it's threaded now so it's ready.
  const firstName =
    greetName ||
    (profileData.name ? String(profileData.name).trim().split(' ')[0] : null) ||
    status?.profile?.first_name ||
    (previewActive ? PREVIEW_SEED.userName : null) ||
    null;



  return (
    <ActionDockProvider>
    <div className={`cinematic-container${isFinishing ? ' is-finishing' : ''}`}>
      <div className="shimmer" aria-hidden="true" />
      <div className="cinematic-orb cinematic-orb-1" aria-hidden="true" />
      <div className="cinematic-orb cinematic-orb-2" aria-hidden="true" />

      {/* Progress Rail (guided flow steps) */}
      {railActive && (
        <div className="cine-rail" role="navigation" aria-label="Onboarding progress">
          {RAIL_STEPS.map((step, i) => {
            const isCurrent = i === railIndex;
            const isDone = i < railIndex;
            return (
              <span
                key={step.view}
                className={`cine-rail-step${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {step.label}
              </span>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {((railActive && railIndex > 0) || (currentView === 'entry' && currentEntryProgress > 0 && !isEntryAuthenticating)) && (
          <motion.button
            key="cine-back"
            type="button"
            className="cine-back"
            onClick={handleStepBack}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            ← Back
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
              className="flex flex-col items-center justify-center text-center"
            >
              <div className="cine-finishing-rings" aria-hidden="true">
                <div className="cine-finishing-ring" />
                <div className="cine-finishing-ring" />
                <div className="cine-finishing-ring" />
                <div className="cine-finishing-dot" />
              </div>
            </motion.div>
          ) : (
            <>
              {currentView === 'entry' && (
                <CastingEntry
                  key={`entry-${previewActive ? preview.subStep ?? 'choice' : 'live'}`}
                  onComplete={handleEntryComplete}
                  onProgress={setCurrentEntryProgress}
                  registerBack={registerBack}
                  initialStep={previewActive ? preview.subStep : undefined}
                  onAuthenticating={setIsEntryAuthenticating}
                />
              )}

              {currentView === 'greet' && signupMethod === 'google' && (
                <motion.div
                  key="greet-google"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="cs-step-stage select-none"
                >
                  <div className="google-orbit-avatar">
                    <motion.div 
                      className="google-quadrant-ring"
                      initial={{ opacity: 0, scale: 0.9, rotate: -120 }}
                      animate={{ opacity: 0.85, scale: 1, rotate: 0 }}
                      transition={{
                        opacity: { duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] },
                        rotate: { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }
                      }}
                    />
                    <motion.img 
                      src={oauthUserData?.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'} 
                      alt="Google avatar" 
                      initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px) grayscale(100%)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px) grayscale(0%)' }}
                      transition={{
                        opacity: { duration: 1.6, ease: [0.22, 1, 0.36, 1] },
                        filter: { duration: 1.6, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 1.2, ease: [0.22, 1, 0.36, 1] }
                      }}
                    />
                  </div>
                  
                  <motion.h2 
                    className="title-serif"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    Good to meet you, <em>{greetName || 'Ava'}</em>
                  </motion.h2>
                  
                  <motion.div 
                    className="google-details"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="google-detail-item">
                      <span className="detail-label">Legal Name</span>
                      <span className="detail-value">{oauthUserData?.name || 'Ava Martinez'}</span>
                    </div>
                    <div className="google-detail-item">
                      <span className="detail-label">Verified Email</span>
                      <span className="detail-value">{oauthUserData?.email || 'ava.martinez@gmail.com'}</span>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {currentView === 'greet' && signupMethod === 'instagram' && (
                <motion.div
                  key="greet-instagram"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="cs-step-stage select-none"
                >
                  <div className="instagram-orbit-avatar">
                    <motion.div 
                      className="instagram-quadrant-ring"
                      initial={{ opacity: 0, scale: 0.9, rotate: -120 }}
                      animate={{ opacity: 0.85, scale: 1, rotate: 0 }}
                      transition={{
                        opacity: { duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] },
                        rotate: { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }
                      }}
                    />
                    <motion.img 
                      src={oauthUserData?.picture || 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80'} 
                      alt="Instagram avatar" 
                      initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px) grayscale(100%)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px) grayscale(0%)' }}
                      transition={{
                        opacity: { duration: 1.6, ease: [0.22, 1, 0.36, 1] },
                        filter: { duration: 1.6, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 1.2, ease: [0.22, 1, 0.36, 1] }
                      }}
                    />
                  </div>
                  
                  <motion.h2 
                    className="title-serif"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  >
                    Good to meet you, <em>@{greetName || 'ava'}</em>
                  </motion.h2>
                  
                  <motion.p 
                    className="label-sans"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  >
                    Instagram account linked
                  </motion.p>
                </motion.div>
              )}

              {currentView === 'greet' && signupMethod !== 'google' && signupMethod !== 'instagram' && (
                <motion.div
                  key="greet-email"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="cs-step-stage select-none"
                >
                  <div className="monogram-orbit">
                    <motion.div 
                      className="monogram-circle"
                      initial={{ opacity: 0, scale: 0.9, rotate: -120 }}
                      animate={{ opacity: 0.85, scale: 1, rotate: 0 }}
                      transition={{
                        opacity: { duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] },
                        scale: { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] },
                        rotate: { duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }
                      }}
                    />
                    <motion.div 
                      className="monogram-inner"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span className="monogram-letter">
                        {String(greetName || firstName || 'A')[0].toUpperCase()}
                      </span>
                    </motion.div>
                  </div>
                  
                  <motion.h2 
                    className="title-serif"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  >
                    Good day, <em>{greetName || firstName || 'Ava'}</em>
                  </motion.h2>
                </motion.div>
              )}

              {currentView === 'verify' && (
                <CastingVerifyEmail
                  key="verify"
                  email={oauthUserData?.email || status?.user?.email || null}
                  previewActive={previewActive}
                  onComplete={() => {
                    if (greetName) {
                      setCurrentView('greet');
                    } else {
                      setCurrentView('birthdate');
                    }
                  }}
                />
              )}

              {currentView === 'birthdate' && (
                <CastingBirthdate
                  key="birthdate"
                  onComplete={handleBirthdateComplete}
                  firstName={firstName}
                />
              )}

              {currentView === 'gender' && (
                <CastingGender
                  key="gender"
                  onComplete={handleGenderComplete}
                  firstName={firstName}
                />
              )}

              {currentView === 'scout' && (
                <CastingScout
                  key="scout"
                  onComplete={handleScoutComplete}
                  userName={previewActive ? PREVIEW_SEED.userName : status?.profile?.first_name}
                  firstName={firstName}
                  fullLengthEnabled={!heightOnlyMeasurements}
                />
              )}

              {currentView === 'measurements' && (
                <CastingMeasurements
                  // Remount when the previewed sub-step changes so it re-enters there.
                  key={`measurements-${previewActive ? preview.subStep ?? 'start' : 'live'}`}
                  onComplete={handleMeasurementsComplete}
                  initialStep={previewActive ? preview.subStep : undefined}
                  heightOnly={heightOnlyMeasurements}
                  gender={profileData.gender}
                  registerBack={registerBack}
                  firstName={firstName}
                />
              )}

              {currentView === 'profile' && (
                <CastingProfile
                  key={`profile-${previewActive ? preview.subStep ?? 'start' : 'live'}`}
                  onComplete={handleProfileComplete}
                  initialProfileStep={previewActive ? preview.subStep : undefined}
                  registerBack={registerBack}
                  firstName={firstName}
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

      {/* The single fixed action for the flow — always mounted (reserved height),
          empty until a step publishes its config via useActionDock. */}
      <ActionDock />

      {/* Progress: a single quiet hairline across the very top of the page. */}
      {railActive && (
        <div className="cinematic-progress-container">
          <div
            className="cinematic-progress-bar"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

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

      <CheckoutHandoff open={handoffOpen} planLabel="Studio+" />
      <SubscriptionCheckoutModal
        open={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        onConfirm={handleCheckoutConfirm}
        isLoading={isOpeningCheckout}
      />
    </div>
    </ActionDockProvider>
  );
}

export default CastingCallPage;
