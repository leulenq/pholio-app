/**
 * Casting Call Page
 * Main controller for the refactored casting flow
 * 
 * Flow: Entry → Scout → Measurements → Profile → Complete
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCastingStatus, useCastingComplete } from '../../hooks/useCasting';

// Step Components
import CastingEntry from './CastingEntry';
import CastingScout from './CastingScout';
import CastingMeasurements from './CastingMeasurements';
import CastingGender from './CastingGender';
import CastingProfile from './CastingProfile';
import './CastingCinematic.css';

function CastingCallPage() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState('entry');
  const [photoData, setPhotoData] = useState(null);
  const [profileData, setProfileData] = useState({});
  const [currentEntryProgress, setCurrentEntryProgress] = useState(0);

  const { data: status, isLoading, error } = useCastingStatus();

  console.log('[CastingCallPage] Rendered', { currentView, status });

  // Step 1: Entry Complete
  const handleEntryComplete = ({ hasOAuthData, manualData }) => {
    console.log('[CastingCallPage] Entry complete', { hasOAuthData, manualData });
    
    // If manual signup included data (previously included gender, now just name/email)
    if (manualData) {
      setProfileData(prev => ({ ...prev, ...manualData }));
    }
    
    // Always go to Gender selection next (All users: Manual & Google)
    setCurrentView('gender');
  };

  // Step 1.5: Gender Complete
  const handleGenderComplete = (data) => {
    console.log('[CastingCallPage] Gender complete', data);
    setProfileData(prev => ({ ...prev, gender: data.gender }));
    setCurrentView('scout');
  };

  // Step 2: Scout Complete
  const handleScoutComplete = (data) => {
    console.log('[CastingCallPage] Scout complete', data);
    setPhotoData(data);
    setCurrentView('measurements');
  };

  // Step 3: Measurements Complete
  const handleMeasurementsComplete = (measurements) => {
    console.log('[CastingCallPage] Measurements complete', measurements);
    // Store measurements for reveal
    setProfileData(prev => ({ ...prev, ...measurements }));
    setCurrentView('profile');
  };

  // Step 4: Profile Complete → Done
  const completeMutation = useCastingComplete();
  const [isFinishing, setIsFinishing] = useState(false);

  const handleProfileComplete = async (profile) => {
    console.log('[CastingCallPage] Profile complete, finishing onboarding...', profile);
    setProfileData(prev => ({ ...prev, ...profile }));
    setIsFinishing(true);

    try {
      await completeMutation.mutateAsync();
      console.log('[CastingCallPage] Onboarding marked complete');
    } catch (error) {
      console.error('[CastingCallPage] Error completing onboarding:', error);
    }

    // Hold the preloader for a cinematic beat before navigating
    setTimeout(() => navigate('/reveal'), 2800);
  };

  // Step 5: Complete - Redirect to dashboard
  const handleComplete = () => {
    navigate('/reveal');
  };

  // Auto-redirect or resume if status loaded
  React.useEffect(() => {
    if (!status?.state) return;

    let { current_step } = status.state;
    // Map legacy 'identity' state to the new flow's actual next step
    if (current_step === 'identity') {
      current_step = 'scout';
    }

    console.log('[CastingCallPage] Status update - current_step:', current_step, 'currentView:', currentView);

    // 1. If done, auto-redirect if we aren't already
    if (current_step === 'done' && currentView !== 'complete') {
      console.log('[CastingCallPage] Backend marked as done, auto-redirecting to reveal');
      setCurrentView('complete');
      navigate('/reveal');
      return;
    }

    // 2. If we are on 'entry' but user already completed entrance, resume from where they left off
    if (currentView === 'entry' && current_step !== 'entry' && current_step !== 'done') {
      console.log(`[CastingCallPage] Resuming from step: ${current_step}`);
      setCurrentView(current_step);
    }
  }, [status, navigate, currentView]);

  // Auto-complete view - removed delayed transition since we instantly navigate now
  React.useEffect(() => {
    if (currentView === 'complete') {
      handleComplete();
    }
  }, [currentView]);

  if (isLoading && currentView !== 'entry') {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-[#faf9f7] to-[#f5f4f2] flex items-center justify-center">
        <div className="text-[#0f172a] text-2xl font-medium">Loading...</div>
      </div>
    );
  }

  if (error && currentView !== 'entry') {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-[#faf9f7] to-[#f5f4f2] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-[#0f172a] text-3xl font-semibold mb-4">Something went wrong</h2>
          <p className="text-[#64748b] mb-8">{error.message || 'Please try again later'}</p>
          <button 
            onClick={() => navigate('/login')}
            className="px-8 py-3 bg-[#C9A55A] text-white rounded-lg hover:bg-[#b08d45] hover:shadow-[0_4px_12px_rgba(201,165,90,0.2)] hover:-translate-y-0.5 transition-all font-medium"
          >
            Back to Login
          </button>
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

  return (
    <div className="cinematic-container">
      {/* Ambient Orbs */}
      <div className="cinematic-orb cinematic-orb-1" />
      <div className="cinematic-orb cinematic-orb-2" />
      
      <div className="cinematic-focus-panel">
        <AnimatePresence mode="wait">
          {isFinishing ? (
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
                <CastingScout key="scout" onComplete={handleScoutComplete} userName={status?.profile?.first_name} />
              )}

              {currentView === 'measurements' && (
                <CastingMeasurements
                  key="measurements"
                  photoData={photoData}
                  onComplete={handleMeasurementsComplete}
                />
              )}

              {currentView === 'profile' && (
                <CastingProfile key="profile" onComplete={handleProfileComplete} gender={profileData.gender} />
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

      <div className="cinematic-progress-container">
        <div 
          className="cinematic-progress-bar" 
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
}

export default CastingCallPage;
