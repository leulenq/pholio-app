/**
 * RevealPage - Standalone Reveal Experience
 * 
 * Decoupled from the casting onboarding flow.
 * Fetches the user's current profile data and renders
 * the CastingRevealRadar as a standalone dashboard feature.
 */


import React, { useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CastingRevealRadar from '../onboarding/CastingRevealRadar';
import '../onboarding/CastingCinematic.css';

// Mock Profile for "Perfect" Reveal (Runway Standard)
const MOCK_PROFILE = {
  first_name: "Bella",
  last_name: "Hadid",
  height_cm: 179,
  bust_cm: 86,
  waist_cm: 61,
  hips_cm: 89,
  weight_kg: 55,
  gender: 'female',
  // Ensure enough data for a "perfect" score
};

function RevealPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMock = searchParams.get('mock') === 'true';

  // Fetch profile data for the reveal calculation
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['talent', 'profile'],
    queryFn: async () => {
      // If mock mode, return mock data immediately
      if (isMock) {
        // Simulate network delay for realism
        await new Promise(resolve => setTimeout(resolve, 800));
        return MOCK_PROFILE;
      }

      const res = await fetch('/api/talent/profile', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load profile');
      const json = await res.json();
      return json.data?.profile || json.profile || json;
    },
    // Don't refetch mock data
    staleTime: isMock ? Infinity : 0
  });

  const handleComplete = () => {
    navigate('/dashboard/talent');
  };

  const handleScoresCalculated = useCallback(async (scores) => {
    // Don't persist mock scores
    if (isMock) {
      console.log('[RevealPage] Mock scores calculated (not saved):', scores);
      return;
    }

    try {
      await fetch('/api/talent/profile/fit-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(scores)
      });
      console.log('[RevealPage] Fit scores persisted:', scores);
    } catch (err) {
      console.warn('[RevealPage] Failed to persist fit scores:', err);
    }
  }, [isMock]);
 
  // Map profile fields to the format expected by CastingRevealRadar
  // This must be called before conditional returns to maintain hook order
  const profileData = useMemo(() => {
    if (!profile) return null;
    return {
      height_cm: profile.height_cm,
      bust_cm: profile.bust_cm,
      waist_cm: profile.waist_cm,
      hips_cm: profile.hips_cm,
      weight_kg: profile.weight_kg,
      gender: profile.gender?.toLowerCase() || 'female',
      look_descriptor: profile.look_descriptor,
      image_analysis: profile.image_analysis,
      // Derived fields from image_analysis for UI components
      verdict: profile.image_analysis?.castingNotes || profile.image_analysis?.verdict || 'Ready for assessment',
      signals: profile.image_analysis?.marketSignals || profile.image_analysis?.market_signals || [],
      strengths: profile.image_analysis?.bookingStrengths || profile.image_analysis?.booking_strengths || [],
      metrics: profile.image_analysis?.measurementEstimates || profile.image_analysis?.measurement_estimates || {}
    };
  }, [profile]);

  // Loading State
  if (isLoading) {
    return (
      <div className="cinematic-container">
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="cinematic-orb cinematic-orb-2" />
        <div className="flex flex-col items-center justify-center gap-4">
           {/* Pulsing Radar Loader */}
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-2 border-[#C9A55A] rounded-full opacity-20 animate-ping" />
            <div className="absolute inset-0 border border-[#C9A55A] rounded-full opacity-40 animate-pulse" />
            <div className="absolute inset-4 bg-[#C9A55A] rounded-full opacity-80 animate-bounce" />
          </div>
          <div className="text-white text-xl font-serif tracking-widest uppercase opacity-80">
            {isMock ? 'Simulating Analysis...' : 'Analyzing Profile...'}
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !profile) {
    return (
      <div className="cinematic-container">
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
          <h2 className="text-white text-3xl font-serif">Unable to Load Profile</h2>
          <p className="text-white/50 max-w-md">{error?.message || 'Please check your connection and try again.'}</p>
          <button
            onClick={() => navigate('/dashboard/talent')}
            className="cinematic-button"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Check for critical missing data (if not mocking)
  // Need height + waist + hips + gender: hips unlocks 50% of Commercial score weight
  const hasCriticalData = profile.height_cm && profile.waist_cm && profile.hips_cm && profile.gender;
  
  if (!isMock && !hasCriticalData) {
     return (
      <div className="cinematic-container">
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 text-center max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-serif text-white">
            <span className="text-[#C9A55A]">Data Missing</span>
          </h2>
          <p className="text-white/70 text-lg leading-relaxed">
            We cannot calculate your casting readiness without your key measurements. 
            Please complete your profile to unlock your analysis.
          </p>
          
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button
               onClick={() => navigate('/dashboard/talent/settings/measurements')}
               className="cinematic-button"
            >
              Update Measurements
            </button>
            <button
               onClick={() => navigate('/dashboard/talent')}
               className="text-white/40 text-sm uppercase tracking-widest hover:text-white transition-colors py-2"
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
     );
  }


  return (
    <div className="cinematic-container">
      <div className="cinematic-orb cinematic-orb-1" />
      <div className="cinematic-orb cinematic-orb-2" />
      
      {/* Mock Indicator */}
      {isMock && (
        <div className="absolute top-4 left-4 bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-1 rounded text-xs font-mono uppercase tracking-wider z-50">
          Mock Data Mode
        </div>
      )}

      <CastingRevealRadar
        profileData={profileData}
        onComplete={handleComplete}
        onScoresCalculated={handleScoresCalculated}
      />
    </div>
  );
}

export default RevealPage;
