/**
 * Casting Reveal Preview - Standalone Demo Page
 *
 * Direct link for testing/demoing the radar reveal without completing full flow.
 * Access at: /onboarding/preview-reveal
 *
 * Includes multiple sample profiles to showcase different fit types.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import CastingRevealRadar from './CastingRevealRadar';
import '../styles/CastingCinematic.css';

// Sample profile presets
const SAMPLE_PROFILES = {
  runway: {
    name: 'Runway Model',
    description: 'Tall, slender, high fashion proportions',
    data: {
      height_cm: 178,
      bust_cm: 86,
      waist_cm: 61,
      hips_cm: 91,
      weight_kg: 60,
      gender: 'female',
      city: 'New York, USA',
      experience_level: 'professional'
    }
  },
  commercial: {
    name: 'Commercial Talent',
    description: 'Accessible height, classic proportions',
    data: {
      height_cm: 170,
      bust_cm: 91,
      waist_cm: 66,
      hips_cm: 96,
      weight_kg: 65,
      gender: 'female',
      city: 'Los Angeles, USA',
      experience_level: 'intermediate'
    }
  },
  athletic: {
    name: 'Athletic/Fitness',
    description: 'Athletic build, low body fat',
    data: {
      height_cm: 172,
      bust_cm: 84,
      waist_cm: 64,
      hips_cm: 88,
      weight_kg: 58,
      gender: 'female',
      city: 'Miami, USA',
      experience_level: 'intermediate'
    }
  },
  editorial: {
    name: 'Editorial Model',
    description: 'Tall with striking proportions',
    data: {
      height_cm: 180,
      bust_cm: 84,
      waist_cm: 58,
      hips_cm: 89,
      weight_kg: 58,
      gender: 'female',
      city: 'Paris, France',
      experience_level: 'professional'
    }
  },
  male_runway: {
    name: 'Male Runway',
    description: 'Tall, lean, V-taper build',
    data: {
      height_cm: 188,
      bust_cm: 99,  // chest
      waist_cm: 78,
      hips_cm: 95,
      weight_kg: 75,
      gender: 'male',
      city: 'Milan, Italy',
      experience_level: 'professional'
    }
  },
  beginner: {
    name: 'New Talent',
    description: 'Entry-level, developing profile',
    data: {
      height_cm: 168,
      bust_cm: 89,
      waist_cm: 68,
      hips_cm: 94,
      weight_kg: 62,
      gender: 'female',
      city: 'Chicago, USA',
      experience_level: 'beginner'
    }
  }
};

function CastingRevealPreview() {
  const navigate = useNavigate();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showReveal, setShowReveal] = useState(false);

  const handleProfileSelect = (profileKey) => {
    setSelectedProfile(SAMPLE_PROFILES[profileKey]);
    setShowReveal(true);
  };

  const handleComplete = () => {
    setShowReveal(false);
    setSelectedProfile(null);
  };

  const handleBack = () => {
    setShowReveal(false);
    setSelectedProfile(null);
  };

  if (showReveal && selectedProfile) {
    return (
      <div className="cinematic-container">
        {/* Ambient Orbs */}
        <div className="cinematic-orb cinematic-orb-1" />
        <div className="cinematic-orb cinematic-orb-2" />

        {/* Back Button */}
        <button
          onClick={() => navigate('/onboarding/test')}
          className="fixed top-4 left-4 z-50 bg-black/50 text-white px-4 py-2 rounded text-xs uppercase tracking-[0.3em] transition-colors"
        >
          Back to Test
        </button>

        {/* Profile Info Badge */}
        <div className="fixed top-8 right-8 z-50 text-right">
          <div className="text-white/70 text-sm font-serif">{selectedProfile.name}</div>
          <div className="text-white/40 text-xs">{selectedProfile.description}</div>
        </div>

        <CastingRevealRadar
          profileData={selectedProfile.data}
          onComplete={handleComplete}
        />
      </div>
    );
  }

  return (
    <div className="cinematic-container">
      {/* Ambient Orbs */}
      <div className="cinematic-orb cinematic-orb-1" />
      <div className="cinematic-orb cinematic-orb-2" />

      <div className="cinematic-focus-panel">
        <motion.div
          className="max-w-6xl mx-auto px-4 py-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-serif text-white mb-4">
              Radar Reveal <span className="text-[#C9A55A]">Preview</span>
            </h1>
            <p className="text-white/50 text-sm uppercase tracking-[0.3em] mb-8">
              Select a sample profile to preview the assessment
            </p>

            {/* Info Box */}
            <div className="cinematic-ghost max-w-2xl mx-auto p-6 mb-8">
              <p className="text-white/70 text-sm leading-relaxed">
                This preview showcases the <strong className="text-[#C9A55A]">Data-Driven Market Fit Assessment</strong> that talent users see after completing the casting flow.
                Each profile demonstrates different scoring patterns across the 5 modeling categories.
              </p>
            </div>
          </div>

          {/* Profile Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(SAMPLE_PROFILES).map(([key, profile]) => (
              <motion.button
                key={key}
                onClick={() => handleProfileSelect(key)}
                className="cinematic-ghost p-6 text-left hover:border-[#C9A55A]/50 transition-all duration-300 group"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Title */}
                <h3 className="text-xl font-serif text-white mb-2 group-hover:text-[#C9A55A] transition-colors">
                  {profile.name}
                </h3>

                {/* Description */}
                <p className="text-white/50 text-sm mb-4">
                  {profile.description}
                </p>

                {/* Stats */}
                <div className="space-y-1 text-xs text-white/40">
                  <div className="flex justify-between">
                    <span>Height:</span>
                    <span className="text-white/60">{profile.data.height_cm}cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Waist:</span>
                    <span className="text-white/60">{profile.data.waist_cm}cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gender:</span>
                    <span className="text-white/60 capitalize">{profile.data.gender}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Experience:</span>
                    <span className="text-white/60 capitalize">{profile.data.experience_level}</span>
                  </div>
                </div>

                {/* View Button */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <span className="text-[#C9A55A] text-xs uppercase tracking-[0.3em] group-hover:tracking-[0.4em] transition-all">
                    View Assessment →
                  </span>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Footer Actions */}
          <div className="mt-12 text-center space-y-4">
            <button
              onClick={() => navigate('/onboarding')}
              className="cinematic-button"
            >
              Start Real Casting Flow
            </button>

            <div className="text-white/30 text-xs">
              Or{' '}
              <a
                href="/dashboard/talent"
                className="text-[#C9A55A] hover:text-[#b08d45] transition-colors"
              >
                go to dashboard
              </a>
            </div>
          </div>

          {/* Technical Info */}
          <div className="mt-16 cinematic-ghost p-6 max-w-3xl mx-auto">
            <h4 className="text-white/70 font-serif text-lg mb-4">Technical Details</h4>
            <div className="space-y-2 text-sm text-white/50">
              <p>
                <strong className="text-white/70">Algorithm:</strong> Industry-standard body ratios (WHR, WHtR, BMI, BWR)
              </p>
              <p>
                <strong className="text-white/70">Categories:</strong> Runway, Editorial, Commercial, Lifestyle, Swim/Fitness
              </p>
              <p>
                <strong className="text-white/70">Visualization:</strong> Recharts radar chart with animated reveal
              </p>
              <p>
                <strong className="text-white/70">Documentation:</strong>{' '}
                <code className="text-[#C9A55A]">docs/RADAR_REVEAL.md</code>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default CastingRevealPreview;
