/**
 * Casting Birthdate - Onboarding step for date of birth collection
 * Cinematic style matching CastingGender.jsx
 * Legal Phase 0: COPPA floor (age ≥ 13), minor notice for age < 18
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { fadeVariants, childVariants } from './animations';
import { useCastingBirthdate } from '../hooks/useCasting';
import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';

const TODAY = new Date();
const TODAY_STR = TODAY.toISOString().slice(0, 10);
const MIN_DATE_STR = `${TODAY.getFullYear() - 100}-01-01`;

function computeAgeFromStr(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  let age = TODAY.getFullYear() - year;
  const beforeBirthday =
    TODAY.getMonth() + 1 < month ||
    (TODAY.getMonth() + 1 === month && TODAY.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function CastingBirthdate({ onComplete }) {
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const birthdateMutation = useCastingBirthdate();

  const age = computeAgeFromStr(dob);
  const isMinor = age !== null && age >= 13 && age < 18;
  const isTooYoung = age !== null && age < 13;
  const isValid = dob && age !== null && age >= 13;

  const handleChange = (e) => {
    const val = e.target.value;
    setDob(val);
    setError('');
  };

  const handleContinue = async () => {
    if (!dob) {
      setError('Please enter your date of birth.');
      return;
    }
    if (age === null) {
      setError('Please enter a valid date.');
      return;
    }
    if (isTooYoung) {
      setError('You must be at least 13 years old to create an account.');
      return;
    }
    if (birthdateMutation.isPending) return;

    try {
      await birthdateMutation.mutateAsync({ date_of_birth: dob });
      onComplete({ date_of_birth: dob, age });
    } catch (err) {
      toast.error(err?.message || 'Could not save. Please try again.');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isValid) handleContinue();
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
        text="When were you *born*?"
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
        <input
          type="date"
          className="cinematic-input"
          style={{ colorScheme: 'dark', cursor: 'pointer' }}
          value={dob}
          min={MIN_DATE_STR}
          max={TODAY_STR}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Date of birth"
          aria-invalid={!!error}
        />

        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key="error"
              className="cinematic-field-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {error}
            </motion.p>
          )}

          {isMinor && !error && (
            <motion.p
              key="minor-notice"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                marginTop: '1rem',
                fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.45)',
                lineHeight: 1.5,
                fontFamily: "var(--cinematic-font-sans, 'Inter', sans-serif)",
              }}
            >
              A parent or guardian will need to verify your account before you can apply to agencies.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isValid && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="cinematic-hint"
              onClick={handleContinue}
            >
              {birthdateMutation.isPending ? 'Saving…' : 'Press Enter ↵'}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default CastingBirthdate;
