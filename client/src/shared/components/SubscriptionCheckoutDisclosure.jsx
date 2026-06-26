import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { MARKETING_SITE_URL } from '../lib/logout';
import PholioBillingWordmark from './billing/PholioBillingWordmark';
import './SubscriptionCheckoutDisclosure.css';

const EASE = [0.22, 1, 0.36, 1];
const linkClass = 'ph-billing-link';

/**
 * Required billing disclosure + checkbox before Stripe checkout (ROSCA / CA ARL).
 */
export function SubscriptionCheckoutDisclosure({
  priceLabel = '$9.99',
  priceUnit = '/month',
  trialDays = 14,
  renewalLabel = `${priceLabel}${priceUnit}`,
  accepted,
  onAcceptedChange,
  id = 'billing-disclosure',
}) {
  return (
    <div className="ph-billing-disclosure">
      <p className="ph-billing-disclosure__text">
        Studio+ is a <strong>software subscription</strong> — Pholio is not a talent agency and
        does not guarantee representation, bookings, or income. Your plan includes a{' '}
        {trialDays}-day free trial, then {renewalLabel} until you cancel. Subscriptions auto-renew
        each billing period. Cancel anytime in Settings; access continues through the end of the
        paid period. See our{' '}
        <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Terms
        </a>{' '}
        and{' '}
        <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Privacy Policy
        </a>
        .
      </p>
      <label className="ph-billing-disclosure__check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
        />
        <span>
          I understand the trial and auto-renewal terms and agree to be charged after the trial
          unless I cancel.
        </span>
      </label>
    </div>
  );
}

/**
 * Premium Pholio checkout modal — last brand-controlled step before Stripe handoff.
 */
export function SubscriptionCheckoutModal({
  open,
  onClose,
  onConfirm,
  isLoading,
  subscription,
}) {
  const reduceMotion = useReducedMotion();
  const [accepted, setAccepted] = useState(false);
  const plans = useMemo(() => {
    const fallbackPlans = [
      {
        interval: 'monthly',
        priceLabel: '$9.99',
        priceUnit: '/month',
        renewalLabel: '$9.99/month',
      },
      {
        interval: 'annual',
        priceLabel: '$95.88',
        priceUnit: '/year',
        renewalLabel: '$95.88/year',
        secondaryLabel: '$7.99/month equivalent',
      },
    ];

    return subscription?.checkoutPlans?.length ? subscription.checkoutPlans : fallbackPlans;
  }, [subscription?.checkoutPlans]);

  const [selectedInterval, setSelectedInterval] = useState(
    subscription?.billingInterval || 'monthly',
  );

  const selectedPlan =
    plans.find((plan) => plan.interval === selectedInterval) || plans[0];
  const priceLabel = selectedPlan?.priceLabel || '$9.99';
  const priceUnit = selectedPlan?.priceUnit || '/month';
  const renewalLabel = selectedPlan?.renewalLabel || `${priceLabel}${priceUnit}`;
  const trialDays = subscription?.trialDays ?? 14;

  const resetModal = () => {
    setAccepted(false);
    setSelectedInterval(subscription?.billingInterval || 'monthly');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleConfirm = () => {
    resetModal();
    onConfirm({
      billing_disclosure_accepted: true,
      interval: selectedPlan?.interval || 'monthly',
    });
  };

  if (!open) return null;

  return (
    <div className="ph-billing-modal-scrim" role="presentation" onClick={handleClose}>
      <motion.div
        className="ph-billing-modal"
        role="dialog"
        aria-labelledby="billing-modal-title"
        onClick={(e) => e.stopPropagation()}
        initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <div className="ph-billing-modal__hero">
          <PholioBillingWordmark variant="on-ink" size="md" />
          <h2 id="billing-modal-title" className="ph-billing-modal__title">
            Start your {trialDays}-day Studio+ trial
          </h2>
          <p className="ph-billing-modal__lede">
            Premium portfolio tools, deeper analytics, and the full Pholio experience.
          </p>
        </div>

        <div className="ph-billing-modal__body">
          <div className="ph-billing-modal__plans" role="radiogroup" aria-label="Billing interval">
            {plans.map((plan) => {
              const selected = plan.interval === selectedInterval;
              return (
                <button
                  key={plan.interval}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`ph-billing-plan${selected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedInterval(plan.interval)}
                >
                  <span className="ph-billing-plan__label">
                    {plan.interval === 'annual' ? 'Annual' : 'Monthly'}
                  </span>
                  <span className="ph-billing-plan__price">
                    {plan.priceLabel}
                    <span className="ph-billing-plan__unit">{plan.priceUnit}</span>
                  </span>
                  {plan.secondaryLabel && (
                    <span className="ph-billing-plan__note">{plan.secondaryLabel}</span>
                  )}
                </button>
              );
            })}
          </div>

          <SubscriptionCheckoutDisclosure
            priceLabel={priceLabel}
            priceUnit={priceUnit}
            renewalLabel={renewalLabel}
            trialDays={trialDays}
            accepted={accepted}
            onAcceptedChange={setAccepted}
          />

          <div className="ph-billing-modal__actions">
            <button
              type="button"
              className="ph-billing-btn ph-billing-btn--ghost"
              onClick={handleClose}
              disabled={isLoading}
            >
              Not now
            </button>
            <button
              type="button"
              className="ph-billing-btn ph-billing-btn--primary"
              disabled={!accepted || isLoading}
              onClick={handleConfirm}
            >
              {isLoading ? 'Preparing checkout…' : 'Continue to secure checkout'}
            </button>
          </div>

          <p className="ph-billing-modal__secure">
            <Lock size={12} strokeWidth={1.8} aria-hidden="true" />
            Encrypted checkout · Cancel anytime
          </p>
        </div>
      </motion.div>
    </div>
  );
}
