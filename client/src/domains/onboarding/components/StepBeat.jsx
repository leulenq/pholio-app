import React from 'react';
import { ThinkingText } from '../pages/ThinkingText';
import { CinematicDivider } from '../pages/CinematicDivider';

/**
 * Prototype step header — headline then divider with exactly 2.4rem between them.
 * The .q headline carries no bottom margin; the divider owns the rhythm.
 */
export default function StepBeat({ text, dividerDelay = 0.4, questionDelay = 0.3 }) {
  return (
    <div className="cs-step-beat">
      <ThinkingText text={text} className="cinematic-question" delay={questionDelay} />
      <CinematicDivider delay={dividerDelay} />
    </div>
  );
}
