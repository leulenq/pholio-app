/**
 * Casting Gender - Standalone cinematic step for gender selection
 * Redesigned: 2x2 card grid with gold accent system
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeVariants, childVariants } from './animations';
import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';
import { CinematicNextButton } from './CinematicNextButton';

const GENDER_OPTIONS = [
  { id: 'Female', label: 'Female', icon: '♀' },
  { id: 'Male', label: 'Male', icon: '♂' },
  { id: 'Non-Binary', label: 'Non-Binary', icon: '⬡' },
  { id: 'Prefer not to say', label: 'Undisclosed', icon: '—' }
];

export function CastingGender({ onComplete }) {
  const [selected, setSelected] = useState(null);

  const handleContinue = () => {
    if (!selected) return;
    onComplete({ gender: selected });
  };

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="text-center"
    >
      <ThinkingText
        text="How do you *identify*?"
        className="cinematic-question"
        style={{ marginBottom: '2rem' }}
        delay={0.3}
      />

      <CinematicDivider delay={0.4} style={{ marginBottom: '3rem' }} />

      <motion.div
        className="cinematic-ghost"
        layoutId="cinematic-card"
        variants={childVariants}
        style={{ maxWidth: '600px', margin: '0 auto' }}
      >
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {GENDER_OPTIONS.map((option, i) => {
            const isActive = selected === option.id;

            return (
              <motion.button
                key={option.id}
                onClick={() => setSelected(option.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="relative flex flex-col items-center justify-center py-8 px-4 rounded-2xl transition-all duration-300 focus:outline-none overflow-hidden"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(201, 165, 90, 0.12) 0%, rgba(201, 165, 90, 0.04) 100%)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${isActive ? 'rgba(201, 165, 90, 0.35)' : 'rgba(255, 255, 255, 0.06)'}`,
                  boxShadow: isActive
                    ? '0 0 40px rgba(201, 165, 90, 0.12), inset 0 1px 0 rgba(201, 165, 90, 0.1)'
                    : 'none',
                }}
              >
                {/* Gold corner accent on active */}
                {isActive && (
                  <motion.div
                    layoutId="gender-accent"
                    className="absolute top-0 left-0 right-0 h-[1px]"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, #C9A55A 50%, transparent 100%)',
                      opacity: 0.6,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}

                <span
                  className="text-2xl mb-3 transition-all duration-300"
                  style={{
                    color: isActive ? '#C9A55A' : 'rgba(255, 255, 255, 0.2)',
                    filter: isActive ? 'drop-shadow(0 0 10px rgba(201, 165, 90, 0.5))' : 'none',
                    textShadow: isActive ? '0 0 20px rgba(201, 165, 90, 0.3)' : 'none',
                  }}
                >
                  {option.icon}
                </span>

                <span
                  className="text-xs font-sans uppercase tracking-[0.25em] transition-all duration-300"
                  style={{
                    color: isActive ? '#C9A55A' : 'rgba(255, 255, 255, 0.45)',
                    fontWeight: isActive ? 600 : 400,
                    textShadow: isActive ? '0 0 12px rgba(201, 165, 90, 0.2)' : 'none',
                  }}
                >
                  {option.label}
                </span>

                {/* Subtle gold dot indicator */}
                {isActive && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute bottom-3 w-1 h-1 rounded-full bg-[#C9A55A]"
                    style={{ boxShadow: '0 0 8px rgba(201, 165, 90, 0.6)' }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-12"
            >
              <CinematicNextButton onClick={handleContinue}>CONTINUE</CinematicNextButton>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default CastingGender;
