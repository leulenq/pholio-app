/**
 * RevealPage — "The First Card".
 *
 * Fetches the user's real profile + images and renders FirstCard, which owns
 * the cinematic sequence and the welcome letter. No scorecard, no radar, no
 * fit-score persistence, no "Data Missing" dead-end — the card always renders
 * with whatever the user has (name + headshot + height at minimum).
 *
 * Features a dev preview harness in development mode to review adult/minor states.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../../api/talent';
import FirstCard from './FirstCard';
import '../../../onboarding/styles/CastingCinematic.css';
import './FirstCard.css';

const REVEAL_PREVIEWS = [
  {
    id: 'ava',
    label: 'Ava (Adult, Full Specs)',
    profile: {
      first_name: 'Ava',
      last_name: 'Martinez',
      height_cm: 178,
      gender: 'Female',
      image_analysis: JSON.stringify({ marketSignals: ['High Fashion', 'Editorial'] }),
    },
    images: [
      { is_primary: true, path: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80' },
      { shot_type: 'full_body', path: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80' }
    ]
  },
  {
    id: 'leo',
    label: 'Leo (Minor, Height Only)',
    profile: {
      first_name: 'Leo',
      last_name: 'Chen',
      height_cm: 185,
      gender: 'Male',
      date_of_birth: new Date(Date.now() - 14 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 years old
      image_analysis: JSON.stringify({ marketSignals: ['Commercial', 'Athletic'] }),
    },
    images: [
      { is_primary: true, path: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80' }
    ]
  },
  {
    id: 'empty',
    label: 'Taylor (Minimal, No Headshot)',
    profile: {
      first_name: 'Taylor',
      last_name: 'Smith',
      height_cm: null,
      gender: 'Non-binary',
    },
    images: []
  }
];

function RevealPage() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  
  const isDev = import.meta.env.DEV;
  const forcePreview = isDev && (searchParams.get('preview') === 'reveal' || searchParams.get('preview') != null);

  const [activePreviewId, setActivePreviewId] = useState('ava');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['talent', 'profile'],
    queryFn: () => talentApi.getProfile(),
    enabled: !forcePreview, // skip query if forced preview
  });

  const isActuallyLoading = isLoading || isLoadingPreview;
  const isActuallyError = error && !forcePreview;

  // Render preview data if forced or if there is a query error/missing data in DEV mode
  const usePreviewMode = forcePreview || (isDev && (error || !data));
  const activePreview = REVEAL_PREVIEWS.find(p => p.id === activePreviewId) || REVEAL_PREVIEWS[0];

  const profile = usePreviewMode ? activePreview.profile : (data?.profile || data);
  const images = usePreviewMode ? activePreview.images : (data?.images || []);

  // Loading — one quiet pulsing gold dot, no status text.
  if (isActuallyLoading) {
    return (
      <div className="cinematic-container">
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="cinematic-orb cinematic-orb-2" />
        <div className="fc-loader">
          <div className="fc-loader-dot" />
        </div>
      </div>
    );
  }

  // Error — House Voice: present tense, no exclamation.
  if (isActuallyError && !usePreviewMode) {
    return (
      <div className="cinematic-container">
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="fc-stage">
          <div className="fc-scene">
            <h1 className="fc-letter-body">Your card isn&rsquo;t ready yet.</h1>
            <button
              type="button"
              className="fc-cta"
              onClick={() => navigate('/dashboard/talent')}
            >
              Go to your dashboard
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
      <FirstCard profile={profile} images={images} />

      {usePreviewMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-white/10 backdrop-blur-md px-4 py-2.5 rounded-full flex items-center gap-3 text-xs shadow-2xl">
          <span className="text-white/40 font-mono tracking-wider uppercase text-[10px]">Reveal Preview</span>
          <div className="w-[1px] h-3 bg-white/10" />
          {REVEAL_PREVIEWS.map(p => (
            <button
              key={p.id}
              onClick={() => {
                setIsLoadingPreview(true);
                setActivePreviewId(p.id);
                setTimeout(() => setIsLoadingPreview(false), 850);
              }}
              className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                activePreviewId === p.id 
                  ? 'bg-gold text-black font-semibold' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {p.label.split(' ')[0]}
            </button>
          ))}
          <div className="w-[1px] h-3 bg-white/10" />
          <button
            onClick={() => {
              setIsLoadingPreview(true);
              setTimeout(() => setIsLoadingPreview(false), 1200);
            }}
            className="text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
}

export default RevealPage;
