/**
 * Casting Birthdate - Onboarding step for date of birth collection
 * Native calendar picker styled to the flow's underline input system
 * (owner call 2026-07-02: calendar picker, not segmented fields).
 * Legal Phase 0: COPPA floor (age ≥ 13), minor notice for age < 18.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeVariants } from './animations';
import { useCastingBirthdate } from '../hooks/useCasting';
import StepBeat from '../components/StepBeat';
import { InlineErrorText } from '../../../shared/components/states';
import { useActionDock } from '../components/ActionDockContext';
import SpotlightField from '../components/SpotlightField';
import '../styles/CastingSteps.css';

const TODAY = new Date();
const TODAY_STR = TODAY.toISOString().slice(0, 10);
const MIN_DATE_STR = `${TODAY.getFullYear() - 100}-01-01`;

// UTC on purpose — mirrors the server's computeAge (src/shared/lib/talent-age.js)
// so the 13/18 boundary lands on the same calendar day on both sides.
function computeAgeFromStr(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function CastingBirthdate({ onComplete, firstName }) {
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const birthdateMutation = useCastingBirthdate();

  const age = computeAgeFromStr(dob);
  const isMinor = age !== null && age >= 13 && age < 18;
  const isTooYoung = age !== null && age < 13;
  const isValid = dob && age !== null && age >= 13;

  const handleChange = (e) => {
    setDob(e.target.value);
    setError('');
  };

  const handleContinue = async () => {
    if (!dob) {
      setError('Enter your date of birth.');
      return;
    }
    if (age === null) {
      setError('Enter a valid date.');
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
      setError(err?.message || 'Could not save. Try again.');
    }
  };

  useActionDock({
    label: 'Continue',
    enabled: isValid && !birthdateMutation.isPending,
    onAdvance: handleContinue,
  });

  const headline = firstName ? `${firstName}, when were you *born*?` : 'When were you *born*?';

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="cs-step-stage"
    >
      <StepBeat text={headline} />

      <SpotlightField
        type="date"
        value={dob}
        onChange={handleChange}
        onEnter={handleContinue}
        min={MIN_DATE_STR}
        max={TODAY_STR}
        style={{ cursor: 'pointer' }}
        aria-label="Date of birth"
        aria-invalid={!!error}
      />

      <p className="cs-hint">Type MM / DD / YYYY — or tap the calendar</p>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            style={{ marginTop: '0.5rem' }}
          >
            <InlineErrorText message={error} className="cinematic-field-error" />
          </motion.div>
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
            A parent or guardian will need to give consent before your profile
            can be shared with agencies.
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default CastingBirthdate;
