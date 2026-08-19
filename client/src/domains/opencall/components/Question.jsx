import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { riseIn } from './motion';

/**
 * A question on the stage, then the gold rule that sets the rhythm beneath it.
 *
 * `*word*` marks the italic gold keyword the design system puts in every
 * question — the same convention the casting flow's `StepBeat` uses, kept so
 * the two surfaces read as one authored voice.
 */
function render(text) {
  return String(text || '')
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part, index) =>
      part.startsWith('*') && part.endsWith('*') ? (
        // Index keys are correct here: the list is a static split of one literal
        // string and never reorders.
        <em key={index}>{part.slice(1, -1)}</em>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      ),
    );
}

export default function Question({ text, as = 'h1', delay = 0 }) {
  const reduceMotion = useReducedMotion();
  const Heading = motion[as] || motion.h1;
  return (
    <>
      <Heading className="oc__question" {...riseIn(reduceMotion, delay)}>
        {render(text)}
      </Heading>
      <motion.div className="oc__rule" aria-hidden="true" {...riseIn(reduceMotion, delay + 0.1)} />
    </>
  );
}
