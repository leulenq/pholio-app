/**
 * Casting Gender - Standalone cinematic step for gender selection
 * Redesigned: 2x2 card grid with gold accent system
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { fadeVariants, childVariants } from './animations';
import { useCastingGender } from '../hooks/useCasting';
import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';

const GENDER_OPTIONS = [
  { id: 'Female', label: 'Female' },
  { id: 'Male', label: 'Male' },
  { id: 'Non-Binary', label: 'Non-Binary' },
  { id: 'Prefer not to say', label: 'Undisclosed' },
];

export function CastingGender({ onComplete }) {
  const [selected, setSelected] = useState(null);
  const genderMutation = useCastingGender();

  // Selecting an option immediately advances: a brief beat lets the gold
  // selection register, then we persist gender and move to the next section.
  const handleSelect = (optionId) => {
    if (genderMutation.isPending) return;
    setSelected(optionId);
    setTimeout(async () => {
      try {
        await genderMutation.mutateAsync({ gender: optionId });
        onComplete({ gender: optionId });
      } catch (error) {
        toast.error(error?.message || 'Could not save. Please try again.');
      }
    }, 320);
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
        <div className="identity-options">
          {GENDER_OPTIONS.map((option, i) => {
            const isActive = selected === option.id;

            return (
              <motion.button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option.id)}
                disabled={genderMutation.isPending}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`identity-option${isActive ? ' is-selected' : ''}`}
              >
                {option.label}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default CastingGender;
