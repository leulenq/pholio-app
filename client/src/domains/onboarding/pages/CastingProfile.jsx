/**
 * Casting Profile - Step 4: Location & Experience
 * Brand-compliant profile completion
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeVariants, childVariants } from './animations';
import { useCastingProfile } from '../../../hooks/useCasting';
import { useTypeToFocus } from '../../../shared/hooks/useTypeToFocus';
import { toast } from 'sonner';
import { CITIES } from '../../../data/cities';
import { Check } from 'lucide-react';
import { CinematicNextButton, CinematicBackButton } from './CinematicNextButton';

import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';

function CastingProfile({ onComplete, gender }) {
  const [profileStep, setProfileStep] = useState(1); // 1: location, 2: experience
  const [location, setLocation] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('beginner');
  const profileMutation = useCastingProfile();
  
  const inputRef = React.useRef(null);
  useTypeToFocus(inputRef);

  const handleNext = () => {
    if (profileStep === 1 && !location.trim()) {
      return toast.error("Please enter your location");
    }
    
    if (profileStep === 1) {
      setProfileStep(2);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    try {
      const profileData = {
        city: location.trim(),
        experience_level: experienceLevel,
        gender
      };
      await profileMutation.mutateAsync(profileData);
      toast.success('Your profile is ready!');
      onComplete(profileData); // Pass profile data back
    } catch (error) {
      toast.error(error.message || 'Failed to finish profile');
    }
  };

  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleLocationChange = (e) => {
    const val = e.target.value;
    setLocation(val);
    setSelectedIndex(0); // Reset selection
    
    if (val.length > 1) {
      const matches = CITIES.filter(c => 
        c.label.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5); // Limit to 5
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  };

  const selectCity = (cityLabel) => {
    setLocation(cityLabel);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectCity(suggestions[selectedIndex].label);
      }
    } else if (e.key === 'Enter') {
       handleNext();
    }
  };

  return (
    <AnimatePresence mode="wait">
      {profileStep === 1 && (
        <motion.div className="text-center" key="location" variants={fadeVariants} initial="initial" animate="animate" exit="exit">
          <ThinkingText 
            text="Where are you *based*?" 
            className="cinematic-question" 
            style={{ marginBottom: '2rem' }} 
          />

          <CinematicDivider delay={0.4} style={{ marginBottom: '2.5rem' }} />

          <motion.div 
            className="cinematic-ghost relative" 
            layoutId="cinematic-card" 
            variants={childVariants} 
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <input
              ref={inputRef}
              autoFocus
              className="cinematic-input"
              placeholder="City, Country"
              value={location}
              onChange={handleLocationChange}
              onKeyDown={handleKeyDown}
            />
            
            {/* Suggestions Dropdown */}
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-4 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl"
                >
                  {suggestions.map((city, index) => (
                    <div 
                      key={city.label}
                      onClick={() => selectCity(city.label)}
                      className={`
                        px-6 py-4 text-left cursor-pointer transition-colors border-b border-white/5 last:border-0 group
                        ${index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'}
                      `}
                    >
                      <span className={`text-xl font-serif transition-colors ${index === selectedIndex ? 'text-[#C9A55A]' : 'text-white/70 group-hover:text-[#C9A55A]'}`}>
                        {city.name}
                      </span>
                      <span className="text-sm text-white/30 ml-2 group-hover:text-white/50">, {city.country}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            
            <AnimatePresence>
              {location.trim().length > 0 && suggestions.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="cinematic-hint mt-8"
                  onClick={handleNext}
                >
                  Press Enter ↵
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {location.trim().length > 0 && suggestions.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto"
              >
                <CinematicNextButton onClick={handleNext}>NEXT</CinematicNextButton>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}



      {profileStep === 2 && (
        <motion.div className="text-center" key="experience" variants={fadeVariants} initial="initial" animate="animate" exit="exit">
          <ThinkingText
            text="Your *experience* level?"
            className="cinematic-question"
            style={{ marginBottom: '2rem' }}
          />

          <CinematicDivider delay={0.3} style={{ marginBottom: '3rem' }} />

          <motion.div
            className="cinematic-ghost"
            layoutId="cinematic-card"
            variants={childVariants}
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <div className="flex flex-col gap-3 max-w-md mx-auto">
              {[
                { id: 'beginner', label: 'New Face', sub: 'First shoots or early experience', icon: '◇' },
                { id: 'intermediate', label: 'Developing', sub: 'Some work, building your portfolio', icon: '◈' },
                { id: 'professional', label: 'Established', sub: 'Signed or working consistently', icon: '◆' }
              ].map((option, i) => {
                const isActive = experienceLevel === option.id;

                return (
                  <motion.button
                    key={option.id}
                    onClick={() => setExperienceLevel(option.id)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.97 }}
                    className="relative flex items-center gap-5 py-5 px-6 rounded-2xl text-left transition-all duration-300 focus:outline-none"
                    style={{
                      background: isActive ? 'rgba(201, 165, 90, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${isActive ? 'rgba(201, 165, 90, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                      boxShadow: isActive ? '0 0 30px rgba(201, 165, 90, 0.1)' : 'none',
                    }}
                  >
                    <span
                      className="text-lg flex-shrink-0 transition-all duration-300"
                      style={{
                        color: isActive ? '#C9A55A' : 'rgba(255, 255, 255, 0.2)',
                        filter: isActive ? 'drop-shadow(0 0 8px rgba(201, 165, 90, 0.4))' : 'none',
                      }}
                    >
                      {option.icon}
                    </span>

                    <div className="flex flex-col">
                      <span
                        className="text-sm font-sans uppercase tracking-[0.2em] transition-all duration-300 mb-1"
                        style={{
                          color: isActive ? '#C9A55A' : 'rgba(255, 255, 255, 0.6)',
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {option.label}
                      </span>
                      <span
                        className="text-xs font-sans transition-all duration-300"
                        style={{ color: isActive ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)' }}
                      >
                        {option.sub}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence>
              {experienceLevel && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto"
                >
                  <CinematicNextButton onClick={handleSubmit}>FINISH</CinematicNextButton>
                  <CinematicBackButton onClick={() => setProfileStep(1)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CastingProfile;
