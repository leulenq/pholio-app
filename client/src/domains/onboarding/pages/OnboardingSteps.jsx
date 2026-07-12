import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import PholioBillingWordmark from '../../../shared/components/billing/PholioBillingWordmark';
import { AGENCY_ONBOARDING_STEPS as STEPS } from './agencyOnboardingSteps';

export default function OnboardingSteps({
  currentStep,
  agencyName,
  isBusy,
  canContinue,
  onPrevious,
  onNext,
  onFinish,
  children,
}) {
  const activeStep = STEPS[currentStep];
  const isFinalStep = activeStep.id === 'review';
  const headingRef = useRef(null);
  const marker = `${String(currentStep + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`;

  useEffect(() => {
    if (currentStep > 0) headingRef.current?.focus();
  }, [currentStep]);

  return (
    <section className={`agency-onboarding__shell agency-onboarding__shell--${activeStep.id}`}>
      <header className="agency-onboarding__masthead">
        <div className="agency-onboarding__brand" role="img" aria-label="Pholio">
          <PholioBillingWordmark variant="on-ink" size="sm" />
        </div>
        <div className="agency-onboarding__agency-lockup">
          <span>Private agency workspace</span>
          <strong>{agencyName || 'Approved agency'}</strong>
        </div>
        <div className="agency-onboarding__masthead-progress">
          <span>{activeStep.label}</span>
          <strong>{marker}</strong>
        </div>
      </header>

      <div className="agency-onboarding__progress" aria-hidden="true">
        <span style={{ '--agency-onboarding-progress': (currentStep + 1) / STEPS.length }} />
      </div>

      <div className="agency-onboarding__frame">
        <nav className="agency-onboarding__narrative" aria-label="Agency setup chapters">
          <ol>
            {STEPS.map((step, index) => {
              const isComplete = index < currentStep;
              const isActive = index === currentStep;
              return (
                <li
                  key={step.id}
                  className={`${isActive ? 'is-active' : ''} ${isComplete ? 'is-complete' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span aria-hidden="true">
                    {isComplete ? <Check size={12} strokeWidth={2} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <strong>{step.label}</strong>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="agency-onboarding__content">
          <header className="agency-onboarding__header">
            <h1 ref={headingRef} tabIndex={-1}>{activeStep.title}</h1>
            <p>{activeStep.summary}</p>
          </header>

          <div key={activeStep.id} className="agency-onboarding__chapter">
            {children}
          </div>
        </main>
      </div>

      <footer className="agency-onboarding__dock">
        <button
          type="button"
          className="agency-onboarding__button agency-onboarding__button--ghost"
          onClick={onPrevious}
          disabled={currentStep === 0 || isBusy}
        >
          <ArrowLeft size={15} />
          Back
        </button>

        <span>{marker}</span>

        <button
          type="button"
          className="agency-onboarding__button agency-onboarding__button--primary"
          disabled={isBusy || !canContinue}
          onClick={isFinalStep ? onFinish : onNext}
        >
          {isBusy ? 'Saving…' : isFinalStep ? 'Commission workspace' : 'Continue'}
          {!isBusy && <ArrowRight size={15} />}
        </button>
      </footer>
    </section>
  );
}
