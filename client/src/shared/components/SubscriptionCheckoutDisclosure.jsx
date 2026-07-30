import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { MARKETING_SITE_URL } from '../lib/logout';
import PholioButton from './ui/PholioButton';
import './SubscriptionCheckoutDisclosure.css';

const EASE = [0.22, 1, 0.36, 1];
const linkClass = 'ph-billing-link';

// "Free for 14 days" — spelling the number out ("Fourteen days free") inverted
// normal word order to sound editorial and just read as stilted instead.

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
      {/*
        Every fact ROSCA / CA ARL requires — trial length, the price after it,
        that it auto-renews, how to stop it — kept, but as four scanned lines
        instead of a six-line paragraph nobody read. The affirmative tick is a
        recorded consent and is not optional.
      */}
      {/*
        Was a three-row FREE FOR / THEN / CANCEL table. A mini-table for three
        short facts is more furniture than the facts need — three mono labels,
        three columns and two rules to say one sentence. Same disclosure, read
        as a sentence.
      */}
      <p className="ph-billing-terms">
        Free for {trialDays} days, then <strong>{renewalLabel}</strong>, auto-renewing.
        Cancel anytime in Settings — access runs to the end of the paid period.
      </p>

      <p className="ph-billing-disclosure__text">
        Studio+ is a software subscription. Pholio is not a talent agency and does not
        guarantee representation, bookings, or income.{' '}
        <a href={`${MARKETING_SITE_URL}/terms`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Terms
        </a>
        {' · '}
        <a href={`${MARKETING_SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Privacy
        </a>
      </p>

      <label className="ph-billing-disclosure__check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
        />
        <span className="ph-billing-disclosure__box" aria-hidden="true" />
        <span className="ph-billing-disclosure__consent">
          I agree to be charged {renewalLabel} after the trial unless I cancel.
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

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
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
        {/*
          The ink half, built from nothing.

          What it replaces: a wordmark that draws its own gold sweep, a heading,
          a lede of three abstractions, and a second gold sweep under all of it
          from `.hero::after`. Two gold rules in one small field, in a system
          where gold marks one thing.

          What it is: a field with a single subject. The plan name set as a name,
          and one line telling you what you are being offered. The `+` is the
          only gold on the panel — nothing else competes with it.
        */}
        <div className="ph-billing-modal__hero">
          <h2 id="billing-modal-title" className="ph-billing-modal__name">
            Studio<span className="ph-billing-modal__plus">+</span>
          </h2>
          <p className="ph-billing-modal__offer">Free for {trialDays} days</p>
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
                  {/*
                    Two groups, not a three-column grid. The radio and the plan
                    name belong together on the left; the figure and its note
                    belong together on the right. The grid had the mark on its
                    own track, which is why it floated above the label's optical
                    centre, and pushed the annual note into the name's column.
                  */}
                  <span className="ph-billing-plan__mark" aria-hidden="true" />
                  <span className="ph-billing-plan__label">
                    {plan.interval === 'annual' ? 'Annual' : 'Monthly'}
                  </span>
                  <span className="ph-billing-plan__figure">
                    <span className="ph-billing-plan__price">
                      {plan.priceLabel}
                      <span className="ph-billing-plan__unit">{plan.priceUnit}</span>
                    </span>
                    {plan.secondaryLabel ? (
                      <span className="ph-billing-plan__note">{plan.secondaryLabel}</span>
                    ) : null}
                  </span>
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
              className="ph-billing-dismiss"
              onClick={handleClose}
              disabled={isLoading}
            >
              Not now
            </button>
            <PholioButton
              type="button"
              variant="primary"
              disabled={!accepted || isLoading}
              onClick={handleConfirm}
            >
              {isLoading ? 'Preparing…' : 'Start trial'}
            </PholioButton>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
