/**
 * AcknowledgmentBeat — a full-surface typographic response used only at the
 * meaningful gives ("That's the one." after the photo, "Noted." after stats).
 * One serif line in the flow's voice, ~1.5s, interruptible by tap or key.
 * It is a beat, not a loader: no spinner, no status text.
 */

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import '../styles/CastingSteps.css';

export function AcknowledgmentBeat({ text, onDone, duration = 1500 }) {
  const doneRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone?.();
    };

    const timer = setTimeout(finish, duration);

    // Small grace window so the key/tap that triggered this beat can't
    // immediately skip it.
    let skippable = false;
    const grace = setTimeout(() => { skippable = true; }, 320);

    const onKey = () => { if (skippable) finish(); };
    const onPointer = () => { if (skippable) finish(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);

    return () => {
      clearTimeout(timer);
      clearTimeout(grace);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onDone, duration]);

  return (
    <motion.div
      className="cs-ack-beat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.h1
        className="cs-ack-line"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {text}
      </motion.h1>
    </motion.div>
  );
}

export default AcknowledgmentBeat;
