import React from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';

export const STEPS = [
  { id: 'profile', label: 'Profile', eyebrow: 'Step 1', title: 'Set the organization identity' },
  { id: 'branding', label: 'Brand', eyebrow: 'Step 2', title: 'Give the workspace a brand system' },
  { id: 'team', label: 'Team', eyebrow: 'Step 3', title: 'Bring in the people who will use it' },
  { id: 'preferences', label: 'Preferences', eyebrow: 'Step 4', title: 'Choose default working preferences' },
  { id: 'review', label: 'Review', eyebrow: 'Step 5', title: 'Launch the workspace' },
];

export default function OnboardingSteps({
  currentStep,
  setCurrentStep,
  isBusy,
  onPrevious,
  onNext,
  onFinish,
  children,
}) {
  const activeStep = STEPS[currentStep];

  return (
    <section className="agency-onboarding__shell">
      <aside className="agency-onboarding__rail">
        <span className="agency-onboarding__eyebrow">First Login Setup</span>
        <h1>Build a workspace your agency can actually start using today.</h1>
        <p>
          This setup gets the organization, brand system, team access, and working defaults in place
          before the dashboard opens up.
        </p>

        <div className="agency-onboarding__steps">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`agency-onboarding__step ${index === currentStep ? 'is-active' : ''} ${index < currentStep ? 'is-complete' : ''}`}
              onClick={() => setCurrentStep(index)}
            >
              <span className="agency-onboarding__step-index">
                {index < currentStep ? <Check size={14} /> : index + 1}
              </span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.title}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="agency-onboarding__note">
          <Sparkles size={16} />
          <p>
            Existing agencies can skip this because their orgs were backfilled as already complete.
          </p>
        </div>
      </aside>

      <main className="agency-onboarding__content">
        <header className="agency-onboarding__header">
          <span>{activeStep.eyebrow}</span>
          <h2>{activeStep.title}</h2>
        </header>

        {children}

        <footer className="agency-onboarding__footer">
          <button
            type="button"
            className="agency-onboarding__button agency-onboarding__button--ghost"
            onClick={onPrevious}
            disabled={currentStep === 0 || isBusy}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="agency-onboarding__footer-meta">
            {activeStep.id === 'team' && (
              <p>Only already provisioned agency logins can be added in this phase.</p>
            )}
            {activeStep.id !== 'team' && <p>Each continue action saves this step before moving on.</p>}
          </div>

          {activeStep.id === 'review' ? (
            <button
              type="button"
              className="agency-onboarding__button"
              disabled={isBusy}
              onClick={onFinish}
            >
              Launch workspace
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="agency-onboarding__button"
              disabled={isBusy}
              onClick={onNext}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          )}
        </footer>
      </main>
    </section>
  );
}
