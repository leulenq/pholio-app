/**
 * Progress Indicator - Shows casting call progress
 * 4 steps: Entry → Scout/Vibe (parallel) → Reveal
 */

import React from 'react';
import './ProgressIndicator.css';

const STEPS = [
  { id: 'entry', label: 'Entry', icon: '🚀' },
  { id: 'scout', label: 'Scout', icon: '📸' },
  { id: 'vibe', label: 'Vibe', icon: '💭' },
  { id: 'reveal', label: 'Reveal', icon: '✨' }
];

function ProgressIndicator({ currentStep, completedSteps = [], canReveal }) {
  const getStepStatus = (step) => {
    if (completedSteps.includes(step.id)) return 'complete';
    if (currentStep === step.id) return 'active';
    if (step.id === 'reveal' && canReveal) return 'available';
    return 'pending';
  };

  return (
    <div className="progress-indicator">
      <div className="progress-steps">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step);
          const isParallel = step.id === 'scout' || step.id === 'vibe';

          return (
            <React.Fragment key={step.id}>
              <div className={`progress-step progress-step-${status}`}>
                <div className="step-icon">{step.icon}</div>
                <div className="step-label">{step.label}</div>
                {status === 'complete' && (
                  <div className="step-checkmark">✓</div>
                )}
              </div>

              {index < STEPS.length - 1 && (
                <div className={`progress-connector ${completedSteps.includes(step.id) ? 'complete' : ''}`}>
                  {isParallel && <span className="connector-label">or</span>}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default ProgressIndicator;
