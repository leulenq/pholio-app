/**
 * Casting Gender — identity tiles.
 * Four portrait tiles (Female / Male / Non-Binary / Undisclosed) sit free on
 * the stage; the chosen tile lights gold. Confirming routes through the
 * flow's single fixed Action Dock, not a page-local button.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { fadeVariants, childVariants } from './animations';
import { useCastingGender } from '../hooks/useCasting';
import { useActionDock } from '../components/ActionDockContext';
import GenderTiles from '../components/GenderTiles';
import StepBeat from '../components/StepBeat';
import { InlineErrorText } from '../../../shared/components/states';
import '../styles/CastingSteps.css';
import './CastingGender.screen.css';

export function CastingGender({ onComplete, firstName }) {
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const genderMutation = useCastingGender();

  const handleConfirm = async () => {
    if (!selected || genderMutation.isPending) return;
    setError('');
    try {
      await genderMutation.mutateAsync({ gender: selected });
      onComplete({ gender: selected });
    } catch (err) {
      setError(err?.message || 'Could not save. Try again.');
    }
  };

  useActionDock({
    label: genderMutation.isPending ? 'Saving…' : 'Next',
    enabled: !!selected,
    onAdvance: handleConfirm,
  });

  const headline = firstName
    ? `${firstName}, how do you *identify*?`
    : 'How do you *identify*?';

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="cs-step-stage"
    >
      <StepBeat text={headline} />

      <motion.div variants={childVariants} className="casting-gender-stage">
        <GenderTiles
          value={selected}
          onChange={(v) => {
            setError('');
            setSelected(v);
          }}
          disabled={genderMutation.isPending}
        />

        <InlineErrorText message={error} className="cinematic-field-error casting-gender-error" />
      </motion.div>
    </motion.div>
  );
}

export default CastingGender;
